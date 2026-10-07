import { fieldSpec } from "./fields";
import type { FieldSpec } from "./fields";
import type { Catalog, CatalogCollection, CatalogValue, CatalogVariable, ModeSelection, StyleDraft, StyleKind, TextBindableField, TextProps } from "./types";

/**
 * UI-side model helpers: addressing a single bindable field inside a draft,
 * reading and writing its raw value or binding immutably, resolving bound
 * variables to plain values for the CSS preview, and new-style defaults.
 */

export type FieldRef =
    | { kind: "paint"; layer: number; stop?: number }
    | { kind: "effect"; layer: number; field: VariableBindableEffectField }
    | { kind: "grid"; layer: number; field: VariableBindableLayoutGridField }
    | { kind: "text"; field: TextBindableField };

export interface FieldEntry {
    ref: FieldRef;
    spec: FieldSpec;
    /** Human label, e.g. "Fill 1 · Stop 2" or "Drop shadow 1 · Blur". */
    label: string;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const refKey = (ref: FieldRef): string => JSON.stringify(ref);

const EFFECT_LABELS: Record<string, string> = {
    DROP_SHADOW: "Drop shadow",
    INNER_SHADOW: "Inner shadow",
    LAYER_BLUR: "Layer blur",
    BACKGROUND_BLUR: "Background blur",
    NOISE: "Noise",
    TEXTURE: "Texture",
    GLASS: "Glass",
    SHADER: "Shader",
};

const PAINT_LABELS: Record<string, string> = {
    SOLID: "Solid",
    GRADIENT_LINEAR: "Linear gradient",
    GRADIENT_RADIAL: "Radial gradient",
    GRADIENT_ANGULAR: "Angular gradient",
    GRADIENT_DIAMOND: "Diamond gradient",
    IMAGE: "Image",
    VIDEO: "Video",
    PATTERN: "Pattern",
    SHADER: "Shader",
};

export const paintLabel = (p: Paint) => PAINT_LABELS[p.type] ?? p.type;
export const effectLabel = (e: Effect) => EFFECT_LABELS[e.type] ?? e.type;

export const isShadow = (e: Effect): e is DropShadowEffect | InnerShadowEffect =>
    e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW";
export const isBlur = (e: Effect): e is BlurEffect => e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR";

/** Every bindable field of a draft, in display order. */
export const listFields = (draft: StyleDraft): FieldEntry[] => {
    const out: FieldEntry[] = [];
    const push = (ref: FieldRef, kind: StyleKind, id: string, label: string) => {
        const spec = fieldSpec(kind, id);
        if (spec) out.push({ ref, spec, label });
    };
    draft.paints?.forEach((p, layer) => {
        if (p.type === "SOLID") push({ kind: "paint", layer }, "PAINT", "color", `${paintLabel(p)} ${layer + 1}`);
        if ("gradientStops" in p) {
            p.gradientStops.forEach((_, stop) => push({ kind: "paint", layer, stop }, "PAINT", "color", `${paintLabel(p)} ${layer + 1} · Stop ${stop + 1}`));
        }
    });
    draft.effects?.forEach((e, layer) => {
        const name = `${effectLabel(e)} ${layer + 1}`;
        if (isShadow(e)) {
            (["color", "offsetX", "offsetY", "radius", "spread"] as const).forEach((field) =>
                push({ kind: "effect", layer, field }, "EFFECT", field, `${name} · ${fieldSpec("EFFECT", field)!.label}`));
        } else if (isBlur(e)) {
            push({ kind: "effect", layer, field: "radius" }, "EFFECT", "radius", `${name} · Blur`);
        }
    });
    draft.grids?.forEach((g, layer) => {
        const name = `${g.pattern === "GRID" ? "Grid" : g.pattern === "COLUMNS" ? "Columns" : "Rows"} ${layer + 1}`;
        const fields: VariableBindableLayoutGridField[] = g.pattern === "GRID" ? ["sectionSize"] : ["count", "gutterSize", "offset", "sectionSize"];
        fields.forEach((field) => push({ kind: "grid", layer, field }, "GRID", field, `${name} · ${fieldSpec("GRID", field)!.label}`));
    });
    if (draft.text) {
        (["fontFamily", "fontStyle", "fontWeight", "fontSize", "lineHeight", "letterSpacing", "paragraphSpacing", "paragraphIndent"] as const).forEach((field) =>
            push({ kind: "text", field }, "TEXT", field, fieldSpec("TEXT", field)!.label));
    }
    return out;
};

/** The variable id bound at a field, if any. */
export const getBinding = (draft: StyleDraft, ref: FieldRef): string | undefined => {
    switch (ref.kind) {
        case "paint": {
            const p = draft.paints?.[ref.layer];
            if (!p) return undefined;
            if (ref.stop !== undefined && "gradientStops" in p) return p.gradientStops[ref.stop]?.boundVariables?.color?.id;
            return p.type === "SOLID" ? p.boundVariables?.color?.id : undefined;
        }
        case "effect": {
            const e = draft.effects?.[ref.layer] as { boundVariables?: Record<string, VariableAlias> } | undefined;
            return e?.boundVariables?.[ref.field]?.id;
        }
        case "grid":
            return (draft.grids?.[ref.layer]?.boundVariables as Record<string, VariableAlias> | undefined)?.[ref.field]?.id;
        case "text":
            return draft.text?.boundVariables[ref.field]?.id;
    }
};

const withBinding = <T extends { boundVariables?: object }>(target: T, field: string, variableId: string | null): T => {
    const bound = { ...(target.boundVariables ?? {}) } as Record<string, VariableAlias>;
    if (variableId) bound[field] = { type: "VARIABLE_ALIAS", id: variableId };
    else delete bound[field];
    return { ...target, boundVariables: bound };
};

/** Returns a copy of the draft with the field bound to `variableId` (or unbound for null). */
export const setBinding = (draft: StyleDraft, ref: FieldRef, variableId: string | null): StyleDraft => {
    const next = clone(draft);
    switch (ref.kind) {
        case "paint": {
            const p = next.paints![ref.layer];
            if (ref.stop !== undefined && "gradientStops" in p) {
                const stops = [...p.gradientStops];
                stops[ref.stop] = withBinding(stops[ref.stop], "color", variableId);
                next.paints![ref.layer] = { ...p, gradientStops: stops };
            } else if (p.type === "SOLID") {
                next.paints![ref.layer] = withBinding(p, "color", variableId);
            }
            break;
        }
        case "effect":
            next.effects![ref.layer] = withBinding(next.effects![ref.layer] as Effect & { boundVariables?: object }, ref.field, variableId) as Effect;
            break;
        case "grid":
            next.grids![ref.layer] = withBinding(next.grids![ref.layer], ref.field, variableId) as LayoutGrid;
            break;
        case "text":
            next.text = withBinding(next.text!, ref.field, variableId) as TextProps;
            break;
    }
    return next;
};

export type RawValue = number | string | RGBA;

/** The unbound (stored) value at a field. Colours come back as RGBA, alpha included. */
export const getRaw = (draft: StyleDraft, ref: FieldRef): RawValue | undefined => {
    switch (ref.kind) {
        case "paint": {
            const p = draft.paints?.[ref.layer];
            if (!p) return undefined;
            if (ref.stop !== undefined && "gradientStops" in p) return p.gradientStops[ref.stop]?.color;
            if (p.type === "SOLID") return { ...p.color, a: p.opacity ?? 1 };
            return undefined;
        }
        case "effect": {
            const e = draft.effects?.[ref.layer];
            if (!e) return undefined;
            if (isShadow(e)) {
                if (ref.field === "color") return e.color;
                if (ref.field === "offsetX") return e.offset.x;
                if (ref.field === "offsetY") return e.offset.y;
                if (ref.field === "spread") return e.spread ?? 0;
                return e.radius;
            }
            return isBlur(e) ? e.radius : undefined;
        }
        case "grid": {
            const g = draft.grids?.[ref.layer] as Record<string, unknown> | undefined;
            const v = g?.[ref.field];
            return typeof v === "number" ? v : undefined;
        }
        case "text": {
            const t = draft.text;
            if (!t) return undefined;
            switch (ref.field) {
                case "fontFamily": return t.fontName.family;
                case "fontStyle": return t.fontName.style;
                case "fontWeight": return weightFromStyle(t.fontName.style);
                case "fontSize": return t.fontSize;
                case "lineHeight": return t.lineHeight.unit === "AUTO" ? "auto" : t.lineHeight.value;
                case "letterSpacing": return t.letterSpacing.value;
                case "paragraphSpacing": return t.paragraphSpacing;
                case "paragraphIndent": return t.paragraphIndent;
            }
        }
    }
};

/** Returns a copy of the draft with a new raw value at the field. */
export const setRaw = (draft: StyleDraft, ref: FieldRef, value: RawValue): StyleDraft => {
    const next = clone(draft);
    switch (ref.kind) {
        case "paint": {
            const p = next.paints![ref.layer] as Paint & Record<string, unknown>;
            if (ref.stop !== undefined && "gradientStops" in p) {
                const stops = [...(p as GradientPaint).gradientStops];
                stops[ref.stop] = { ...stops[ref.stop], color: value as RGBA };
                next.paints![ref.layer] = { ...(p as GradientPaint), gradientStops: stops };
            } else if (p.type === "SOLID") {
                const { r, g, b, a } = value as RGBA;
                next.paints![ref.layer] = { ...(p as SolidPaint), color: { r, g, b }, opacity: a };
            }
            break;
        }
        case "effect": {
            const e = next.effects![ref.layer];
            if (isShadow(e)) {
                const s = { ...e } as { -readonly [K in keyof DropShadowEffect]: DropShadowEffect[K] };
                if (ref.field === "color") s.color = value as RGBA;
                else if (ref.field === "offsetX") s.offset = { ...e.offset, x: Number(value) };
                else if (ref.field === "offsetY") s.offset = { ...e.offset, y: Number(value) };
                else if (ref.field === "spread") s.spread = Number(value);
                else s.radius = Number(value);
                next.effects![ref.layer] = s;
            } else if (isBlur(e)) {
                next.effects![ref.layer] = { ...e, radius: Number(value) };
            }
            break;
        }
        case "grid":
            next.grids![ref.layer] = { ...next.grids![ref.layer], [ref.field]: Number(value) } as LayoutGrid;
            break;
        case "text": {
            const t = next.text!;
            switch (ref.field) {
                case "fontFamily": t.fontName = { ...t.fontName, family: String(value) }; break;
                case "fontStyle": t.fontName = { ...t.fontName, style: String(value) }; break;
                case "fontWeight": t.fontName = { ...t.fontName, style: styleFromWeight(Number(value), t.fontName.style) }; break;
                case "fontSize": t.fontSize = Number(value); break;
                case "lineHeight":
                    t.lineHeight = value === "auto" ? { unit: "AUTO" } : { value: Number(value), unit: t.lineHeight.unit === "AUTO" ? "PIXELS" : t.lineHeight.unit };
                    break;
                case "letterSpacing": t.letterSpacing = { ...t.letterSpacing, value: Number(value) }; break;
                case "paragraphSpacing": t.paragraphSpacing = Number(value); break;
                case "paragraphIndent": t.paragraphIndent = Number(value); break;
            }
            break;
        }
    }
    return next;
};

const WEIGHTS: [number, string[]][] = [
    [100, ["thin", "hairline"]],
    [200, ["extralight", "extra light", "ultralight", "ultra light"]],
    [300, ["light"]],
    [400, ["regular", "normal", "book", "roman"]],
    [500, ["medium"]],
    [600, ["semibold", "semi bold", "demibold", "demi bold"]],
    [700, ["bold"]],
    [800, ["extrabold", "extra bold", "ultrabold", "ultra bold", "heavy"]],
    [900, ["black"]],
];

export const weightFromStyle = (style: string): number => {
    const s = style.toLowerCase().replace(/italic|oblique/g, "").trim();
    // Longest names first, so "Semi Bold" isn't read as "Bold".
    const sorted = WEIGHTS.flatMap(([w, names]) => names.map((n) => [w, n] as const)).sort((a, b) => b[1].length - a[1].length);
    return sorted.find(([, name]) => s === name || s.startsWith(name))?.[0] ?? 400;
};

const STYLE_NAMES: Record<number, string> = {
    100: "Thin", 200: "Extra Light", 300: "Light", 400: "Regular", 500: "Medium",
    600: "Semi Bold", 700: "Bold", 800: "Extra Bold", 900: "Black",
};

/** Figma's usual style name for a weight, keeping italics ("Bold Italic", or plain "Italic" at 400). */
export const styleFromWeight = (weight: number, current: string): string => {
    const nearest = Math.min(900, Math.max(100, Math.round(weight / 100) * 100));
    const name = STYLE_NAMES[nearest];
    if (!/italic/i.test(current)) return name;
    return nearest === 400 ? "Italic" : `${name} Italic`;
};

// ---------------------------------------------------------------------------
// Resolution

export const isAliasValue = (v: unknown): v is VariableAlias =>
    typeof v === "object" && v !== null && (v as VariableAlias).type === "VARIABLE_ALIAS";

export interface CatalogIndex {
    variables: Map<string, CatalogVariable>;
    collections: Map<string, CatalogCollection>;
}

export const indexCatalog = (catalog: Catalog): CatalogIndex => ({
    variables: new Map(catalog.variables.map((v) => [v.id, v])),
    collections: new Map(catalog.collections.map((c) => [c.id, c])),
});

/**
 * The mode a variable's collection resolves in for the given selection. A
 * mode picked on an extended collection applies to the collection it extends
 * (that's how Figma resolves it on a frame with that explicit mode).
 */
const activeMode = (collectionId: string, index: CatalogIndex, modes: ModeSelection): string | undefined => {
    if (modes[collectionId]) return modes[collectionId];
    for (const [selectedId, modeId] of Object.entries(modes)) {
        let c = index.collections.get(selectedId);
        while (c?.isExtension && c.parentId) {
            if (c.parentId === collectionId) return modeId;
            c = index.collections.get(c.parentId);
        }
    }
    return index.collections.get(collectionId)?.defaultModeId;
};

/** The plain value a variable resolves to under a mode selection, following aliases. */
export const resolveVariableValue = (
    variableId: string,
    index: CatalogIndex,
    modes: ModeSelection,
    depth = 0,
): Exclude<CatalogValue, VariableAlias> | undefined => {
    const v = index.variables.get(variableId);
    if (!v || depth > 10) return undefined;
    const modeId = activeMode(v.collectionId, index, modes);
    let value = modeId ? v.valuesByMode[modeId] : undefined;
    if (value === undefined) value = Object.values(v.valuesByMode)[0];
    if (isAliasValue(value)) return resolveVariableValue(value.id, index, modes, depth + 1);
    return value;
};

/**
 * Returns a copy of the draft with every bound field replaced by the value
 * its variable resolves to, so the CSS preview can treat it as unbound.
 */
export const resolveDraft = (draft: StyleDraft, index: CatalogIndex, modes: ModeSelection): StyleDraft => {
    let out = draft;
    for (const { ref } of listFields(draft)) {
        const id = getBinding(draft, ref);
        if (!id) continue;
        const value = resolveVariableValue(id, index, modes);
        if (value === undefined || typeof value === "boolean") continue;
        if (ref.kind === "text" && ref.field === "lineHeight" && typeof value === "number") {
            // A bound line height is always in pixels.
            out = clone(out);
            out.text!.lineHeight = { value, unit: "PIXELS" };
            continue;
        }
        if (ref.kind === "text" && ref.field === "letterSpacing" && typeof value === "number") {
            out = clone(out);
            out.text!.letterSpacing = { value, unit: "PIXELS" };
            continue;
        }
        out = setRaw(out, ref, value as RawValue);
    }
    return out;
};

/** Collections whose modes could change a draft's look, for the mode switcher. */
export const collectionsUsedBy = (draft: StyleDraft, index: CatalogIndex): CatalogCollection[] => {
    const ids = new Set<string>();
    const visit = (variableId: string, depth = 0) => {
        const v = index.variables.get(variableId);
        if (!v || depth > 10) return;
        ids.add(v.collectionId);
        for (const value of Object.values(v.valuesByMode)) if (isAliasValue(value)) visit(value.id, depth + 1);
    };
    for (const { ref } of listFields(draft)) {
        const id = getBinding(draft, ref);
        if (id) visit(id);
    }
    // Extended collections of a used collection offer their modes too.
    for (const c of index.collections.values()) {
        let p = c;
        while (p.isExtension && p.parentId) {
            if (ids.has(p.parentId)) { ids.add(c.id); break; }
            p = index.collections.get(p.parentId) ?? p;
            if (p === c) break;
        }
    }
    return [...ids]
        .map((id) => index.collections.get(id))
        .filter((c): c is CatalogCollection => !!c && c.modes.length > 1);
};

// ---------------------------------------------------------------------------
// Defaults

let draftCounter = 0;
export const newDraftKey = () => `new:${Date.now().toString(36)}:${draftCounter++}`;

export const defaultSolid = (): SolidPaint => ({ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true, blendMode: "NORMAL" });

export const defaultLinearGradient = (): GradientPaint => ({
    type: "GRADIENT_LINEAR",
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: [
        { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
    ],
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
});

export const defaultShadow = (type: "DROP_SHADOW" | "INNER_SHADOW" = "DROP_SHADOW"): DropShadowEffect | InnerShadowEffect =>
    type === "DROP_SHADOW"
        ? { type, color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0, visible: true, blendMode: "NORMAL", showShadowBehindNode: false }
        : { type, color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 2 }, radius: 4, spread: 0, visible: true, blendMode: "NORMAL" };

export const defaultBlur = (type: "LAYER_BLUR" | "BACKGROUND_BLUR" = "LAYER_BLUR"): BlurEffectNormal => ({ type, blurType: "NORMAL", radius: 4, visible: true });

export const defaultGrid = (pattern: "COLUMNS" | "ROWS" | "GRID" = "COLUMNS"): LayoutGrid =>
    pattern === "GRID"
        ? { pattern, sectionSize: 8, visible: true, color: { r: 1, g: 0, b: 0, a: 0.1 } }
        : { pattern, alignment: "STRETCH", gutterSize: 20, count: pattern === "COLUMNS" ? 12 : 5, offset: 0, visible: true, color: { r: 1, g: 0, b: 0, a: 0.1 } };

export const defaultText = (): TextProps => ({
    fontName: { family: "Inter", style: "Regular" },
    fontSize: 16,
    lineHeight: { unit: "AUTO" },
    letterSpacing: { value: 0, unit: "PERCENT" },
    paragraphSpacing: 0,
    paragraphIndent: 0,
    textCase: "ORIGINAL",
    textDecoration: "NONE",
    leadingTrim: "NONE",
    listSpacing: 0,
    hangingPunctuation: false,
    hangingList: false,
    boundVariables: {},
});

export const newDraft = (kind: StyleKind, name: string): StyleDraft => {
    const base = { key: newDraftKey(), kind, name, description: "" };
    switch (kind) {
        case "PAINT": return { ...base, paints: [defaultSolid()] };
        case "TEXT": return { ...base, text: defaultText() };
        case "EFFECT": return { ...base, effects: [defaultShadow()] };
        case "GRID": return { ...base, grids: [defaultGrid()] };
    }
};
