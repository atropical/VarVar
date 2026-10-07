import { parseTokenColor } from "../utils/color";
import { parseUnitValue } from "../utils/units";
import { defaultShadow, defaultText, newDraft, setBinding, setRaw, styleFromWeight } from "./model";
import type { CatalogIndex, FieldRef, RawValue } from "./model";
import type { GeneratedStyle } from "./ops";
import type { CatalogVariable, StyleDraft, TextBindableField } from "./types";

/**
 * Generator input from a DTCG token file: every `typography` token becomes a
 * text style and every `shadow` token an effect style. A sub-value that is a
 * reference (`{color.shadow}`, or VarVar's `$.Collection.Mode.path`) is bound
 * to the variable of that name when the file has one; otherwise the value is
 * written raw, so the style still matches the token.
 */

const FONT_WEIGHTS: Record<string, number> = {
    thin: 100, hairline: 100, "extra-light": 200, "ultra-light": 200, light: 300, normal: 400, regular: 400, book: 400,
    medium: 500, "semi-bold": 600, "demi-bold": 600, bold: 700, "extra-bold": 800, "ultra-bold": 800, black: 900,
    heavy: 900, "extra-black": 950, "ultra-black": 950,
};

interface CompositeContext {
    variables: CatalogVariable[];
    index: CatalogIndex;
    rootFontSize: number;
    warnings: string[];
}

/** Finds the variable a reference names, trying the path with and without a leading collection segment. */
const findReferenced = (raw: unknown, ctx: CompositeContext): CatalogVariable | undefined => {
    if (typeof raw !== "string") return undefined;
    let parts: string[] | undefined;
    const curly = /^\{([^}]+)\}$/.exec(raw.trim());
    if (curly) parts = curly[1].split(".");
    else if (raw.startsWith("$.")) parts = raw.slice(2).split(".");
    if (!parts) return undefined;
    const candidates = [parts.join("/"), parts.slice(1).join("/"), parts.slice(2).join("/")].filter(Boolean);
    for (const name of candidates) {
        const collectionHint = parts[0];
        const matches = ctx.variables.filter((v) => v.name === name);
        const hit = matches.find((v) => v.collectionName === collectionHint) ?? matches[0];
        if (hit) return hit;
    }
    return undefined;
};

const isReference = (raw: unknown) => typeof raw === "string" && (/^\{[^}]+\}$/.test(raw.trim()) || raw.startsWith("$."));

/** A dimension in px; rem/em are multiplied by the root font size. */
const toPx = (raw: unknown, ctx: CompositeContext, label: string): number | undefined => {
    if (typeof raw === "number") return raw;
    const parsed = parseUnitValue(raw);
    if (!parsed) {
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
        ctx.warnings.push(`${label}: couldn't read ${JSON.stringify(raw)} as a dimension.`);
        return undefined;
    }
    if (parsed.unit === "px") return parsed.number;
    if (parsed.unit === "rem" || parsed.unit === "em") return parsed.number * ctx.rootFontSize;
    ctx.warnings.push(`${label}: unit "${parsed.unit}" can't be converted; used ${parsed.number} as pixels.`);
    return parsed.number;
};

/**
 * Applies one sub-value: binds it when it references a known variable, and
 * always writes a raw value (the referenced variable's, or the literal) so
 * the stored style is right even before Figma resolves the binding.
 */
const applyValue = (
    draft: StyleDraft,
    ref: FieldRef,
    raw: unknown,
    read: (value: unknown) => RawValue | undefined,
    ctx: CompositeContext,
    label: string,
    bound: string[],
): StyleDraft => {
    if (raw === undefined) return draft;
    if (isReference(raw)) {
        const v = findReferenced(raw, ctx);
        if (!v) {
            ctx.warnings.push(`${label}: no variable matches ${String(raw)}, so that field keeps its default.`);
            return draft;
        }
        const value = Object.values(v.valuesByMode)[0];
        const literal = value !== undefined && typeof value !== "object" ? read(value) : typeof value === "object" && value && "r" in value ? (value as RGBA) : undefined;
        let next = literal !== undefined ? setRaw(draft, ref, literal) : draft;
        next = setBinding(next, ref, v.id);
        bound.push(`${label} ← ${v.name}`);
        return next;
    }
    const literal = read(raw);
    return literal === undefined ? draft : setRaw(draft, ref, literal);
};

const typographyStyle = (name: string, value: Record<string, unknown>, ctx: CompositeContext, existing?: StyleDraft): GeneratedStyle => {
    const warnings: string[] = [];
    const local = { ...ctx, warnings };
    const bound: string[] = [];
    let draft: StyleDraft = existing ? JSON.parse(JSON.stringify(existing)) : newDraft("TEXT", name);
    draft.text ??= defaultText();
    const t = (field: TextBindableField): FieldRef => ({ kind: "text", field });

    const family = Array.isArray(value.fontFamily) ? value.fontFamily[0] : value.fontFamily;
    if (Array.isArray(value.fontFamily)) warnings.push(`${name}: font stack ${JSON.stringify(value.fontFamily)} — only "${String(family)}" is used.`);
    draft = applyValue(draft, t("fontFamily"), family, (v) => String(v), local, "Font family", bound);
    draft = applyValue(draft, t("fontWeight"), value.fontWeight, (v) => {
        if (typeof v === "number") return v;
        const n = FONT_WEIGHTS[String(v)] ?? Number(v);
        if (!Number.isFinite(n)) { warnings.push(`${name}: font weight ${JSON.stringify(v)} isn't a DTCG weight.`); return undefined; }
        return n;
    }, local, "Font weight", bound);
    draft = applyValue(draft, t("fontSize"), value.fontSize, (v) => toPx(v, local, `${name} font size`), local, "Font size", bound);
    draft = applyValue(draft, t("letterSpacing"), value.letterSpacing, (v) => toPx(v, local, `${name} letter spacing`), local, "Letter spacing", bound);
    if (draft.text && value.letterSpacing !== undefined && !isReference(value.letterSpacing)) {
        draft.text.letterSpacing = { ...draft.text.letterSpacing, unit: "PIXELS" };
    }

    // DTCG line height is a multiplier of the font size; Figma's percent is the same thing × 100.
    const lh = value.lineHeight;
    if (isReference(lh)) {
        draft = applyValue(draft, t("lineHeight"), lh, (v) => Number(v), local, "Line height", bound);
    } else if (typeof lh === "number" && draft.text) {
        draft.text.lineHeight = { unit: "PERCENT", value: lh * 100 };
    } else if (lh !== undefined && draft.text) {
        const px = toPx(lh, local, `${name} line height`);
        if (px !== undefined) draft.text.lineHeight = { unit: "PIXELS", value: px };
    }

    // A literal weight picks the style name; a bound one is resolved by Figma.
    if (draft.text && typeof value.fontWeight !== "undefined" && !isReference(value.fontWeight)) {
        const w = typeof value.fontWeight === "number" ? value.fontWeight : FONT_WEIGHTS[String(value.fontWeight)];
        if (w) draft.text.fontName = { ...draft.text.fontName, style: styleFromWeight(w, draft.text.fontName.style) };
    }
    return { draft, action: existing ? "update" : "create", bound, warnings };
};

const shadowStyle = (name: string, value: unknown, ctx: CompositeContext, existing?: StyleDraft): GeneratedStyle => {
    const warnings: string[] = [];
    const local = { ...ctx, warnings };
    const bound: string[] = [];
    const layers = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
    let draft: StyleDraft = existing ? { ...JSON.parse(JSON.stringify(existing)), effects: [] } : { ...newDraft("EFFECT", name), effects: [] };
    layers.forEach((layer, i) => {
        draft.effects!.push(defaultShadow(layer.inset === true ? "INNER_SHADOW" : "DROP_SHADOW"));
        const label = layers.length > 1 ? `Shadow ${i + 1} · ` : "";
        const e = (field: VariableBindableEffectField): FieldRef => ({ kind: "effect", layer: i, field });
        draft = applyValue(draft, e("color"), layer.color, (v) => {
            try { return parseTokenColor(v).rgba; } catch (err) { warnings.push(`${name}: ${err instanceof Error ? err.message : String(err)}`); return undefined; }
        }, local, `${label}Colour`, bound);
        draft = applyValue(draft, e("offsetX"), layer.offsetX, (v) => toPx(v, local, `${name} x`), local, `${label}X`, bound);
        draft = applyValue(draft, e("offsetY"), layer.offsetY, (v) => toPx(v, local, `${name} y`), local, `${label}Y`, bound);
        draft = applyValue(draft, e("radius"), layer.blur, (v) => toPx(v, local, `${name} blur`), local, `${label}Blur`, bound);
        draft = applyValue(draft, e("spread"), layer.spread, (v) => toPx(v, local, `${name} spread`), local, `${label}Spread`, bound);
    });
    return { draft, action: existing ? "update" : "create", bound, warnings };
};

export interface CompositeOptions {
    files: string[];
    variables: CatalogVariable[];
    index: CatalogIndex;
    existing: StyleDraft[];
    rootFontSize: number;
    /** Prepended to every style name, e.g. "brand/". */
    namePrefix: string;
}

export interface CompositeResult {
    styles: GeneratedStyle[];
    warnings: string[];
    /** Composite tokens seen by type, including ones that weren't turned into styles. */
    counts: { typography: number; shadow: number };
}

/** Walks DTCG token files (group `$type` inherited) and builds a style per typography or shadow token. */
export const stylesFromCompositeTokens = (opts: CompositeOptions): CompositeResult => {
    const warnings: string[] = [];
    const ctx: CompositeContext = { variables: opts.variables, index: opts.index, rootFontSize: opts.rootFontSize, warnings };
    const styles: GeneratedStyle[] = [];
    const counts = { typography: 0, shadow: 0 };
    const seen = new Set<string>();

    const walk = (node: unknown, path: string[], inheritedType?: string) => {
        if (typeof node !== "object" || node === null || Array.isArray(node)) return;
        const obj = node as Record<string, unknown>;
        const type = typeof obj.$type === "string" ? obj.$type : inheritedType;
        if ("$value" in obj) {
            if (type !== "typography" && type !== "shadow") return;
            const name = `${opts.namePrefix}${path.join("/")}`.replace(/^\/+/, "");
            if (seen.has(`${type}:${name}`)) {
                warnings.push(`${name}: defined more than once; the first one wins.`);
                return;
            }
            seen.add(`${type}:${name}`);
            const kind = type === "typography" ? "TEXT" : "EFFECT";
            const existing = opts.existing.find((d) => d.kind === kind && d.name === name);
            if (type === "typography") {
                counts.typography += 1;
                if (typeof obj.$value !== "object" || obj.$value === null) {
                    warnings.push(`${name}: a typography token whose $value is ${isReference(obj.$value) ? "a reference" : "not an object"} isn't supported.`);
                    return;
                }
                styles.push(typographyStyle(name, obj.$value as Record<string, unknown>, ctx, existing));
            } else {
                counts.shadow += 1;
                if (typeof obj.$value !== "object" || obj.$value === null) {
                    warnings.push(`${name}: a shadow token whose $value is ${isReference(obj.$value) ? "a reference" : "not an object"} isn't supported.`);
                    return;
                }
                styles.push(shadowStyle(name, obj.$value, ctx, existing));
            }
            return;
        }
        for (const [key, child] of Object.entries(obj)) {
            if (key.startsWith("$")) continue;
            walk(child, [...path, key], type);
        }
    };

    for (const file of opts.files) {
        try {
            walk(JSON.parse(file), []);
        } catch (error) {
            warnings.push(`Couldn't read a file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return { styles: styles.sort((a, b) => a.draft.name.localeCompare(b.draft.name)), warnings, counts };
};
