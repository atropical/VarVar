import { rgbToCssColor } from "../utils/color";
import { formatFloat32 } from "../utils/numberFormat";
import { compatibility, fieldSpec, guessField, normaliseSegment } from "./fields";
import {
    defaultBlur, defaultGrid, defaultShadow, defaultText, getBinding, getRaw, isShadow, listFields, newDraft,
    refKey, resolveVariableValue, setBinding, setRaw,
} from "./model";
import type { CatalogIndex, FieldRef, RawValue } from "./model";
import type { CatalogVariable, StyleDraft, StyleKind } from "./types";

/**
 * Operations the composer offers on top of single-field edits: describing a
 * change for the dry-run diff, swapping tokens across many styles, and
 * generating styles from a group of tokens.
 */

// ---------------------------------------------------------------------------
// Diff

export const formatRaw = (value: RawValue | undefined): string => {
    if (value === undefined) return "—";
    if (typeof value === "number") return formatFloat32(value);
    if (typeof value === "string") return value;
    return rgbToCssColor({ r: value.r, g: value.g, b: value.b, a: value.a ?? 1 });
};

export const describeField = (draft: StyleDraft, ref: FieldRef, index: CatalogIndex): string => {
    const id = getBinding(draft, ref);
    if (id) return `{${index.variables.get(id)?.name ?? "missing variable"}}`;
    return formatRaw(getRaw(draft, ref));
};

export interface StyleChange {
    key: string;
    name: string;
    kind: StyleKind;
    action: "create" | "update" | "delete";
    lines: string[];
}

const layerSummary = (d: StyleDraft) =>
    (d.paints ?? d.effects ?? d.grids ?? []).map((l) => ("type" in l ? l.type : (l as LayoutGrid).pattern)).join(", ") || "none";

const TEXT_EXTRAS: (keyof NonNullable<StyleDraft["text"]>)[] = [
    "textCase", "textDecoration", "leadingTrim", "listSpacing", "hangingPunctuation", "hangingList",
];

const TEXT_EXTRA_LABELS: Record<string, string> = {
    textCase: "Case", textDecoration: "Decoration", leadingTrim: "Leading trim", listSpacing: "List spacing",
    hangingPunctuation: "Hanging punctuation", hangingList: "Hanging list markers",
};

/** What changes between a style as stored and its draft, as readable lines. */
export const diffDraft = (before: StyleDraft | undefined, after: StyleDraft, index: CatalogIndex): StyleChange | null => {
    const lines: string[] = [];
    if (!before) {
        for (const f of listFields(after)) lines.push(`${f.label}: ${describeField(after, f.ref, index)}`);
        return { key: after.key, name: after.name, kind: after.kind, action: "create", lines };
    }
    if (before.name !== after.name) lines.push(`Name: ${before.name} → ${after.name}`);
    if (before.description !== after.description) lines.push("Description changed");
    if (layerSummary(before) !== layerSummary(after)) lines.push(`Layers: ${layerSummary(before)} → ${layerSummary(after)}`);

    const beforeFields = new Map(listFields(before).map((f) => [refKey(f.ref), f]));
    for (const f of listFields(after)) {
        const a = describeField(after, f.ref, index);
        const b = beforeFields.has(refKey(f.ref)) ? describeField(before, f.ref, index) : "—";
        if (a !== b) lines.push(`${f.label}: ${b} → ${a}`);
    }
    if (before.text && after.text) {
        for (const k of TEXT_EXTRAS) {
            if (JSON.stringify(before.text[k]) !== JSON.stringify(after.text[k])) lines.push(`${TEXT_EXTRA_LABELS[k]}: ${String(before.text[k])} → ${String(after.text[k])}`);
        }
        if (before.text.lineHeight.unit !== after.text.lineHeight.unit) lines.push(`Line height unit: ${before.text.lineHeight.unit} → ${after.text.lineHeight.unit}`);
        if (before.text.letterSpacing.unit !== after.text.letterSpacing.unit) lines.push(`Letter spacing unit: ${before.text.letterSpacing.unit} → ${after.text.letterSpacing.unit}`);
    }
    // Anything else (gradient handles, blend modes, visibility, grid alignment…).
    if (lines.length === 0 && JSON.stringify(before) !== JSON.stringify(after)) lines.push("Other layer properties changed");
    if (lines.length === 0) return null;
    return { key: after.key, name: after.name, kind: after.kind, action: "update", lines };
};

// ---------------------------------------------------------------------------
// Bulk swap

export interface SwapResult {
    drafts: StyleDraft[];
    swapped: number;
    misses: string[];
}

/**
 * Re-points every binding whose variable name starts with `fromPrefix` to the
 * variable with the same remainder under `toPrefix` — e.g. `color/brand/` →
 * `color/accent/` turns `color/brand/500` into `color/accent/500`. A full name
 * in both fields swaps one variable for another. Same type is required; the
 * same collection is preferred when names collide.
 */
export const bulkSwap = (drafts: StyleDraft[], fromPrefix: string, toPrefix: string, variables: CatalogVariable[], index: CatalogIndex): SwapResult => {
    const misses: string[] = [];
    let swapped = 0;
    const out = drafts.map((draft) => {
        let next = draft;
        for (const f of listFields(draft)) {
            const id = getBinding(draft, f.ref);
            const current = id ? index.variables.get(id) : undefined;
            if (!current || !current.name.startsWith(fromPrefix)) continue;
            const targetName = toPrefix + current.name.slice(fromPrefix.length);
            const candidates = variables.filter((v) => v.name === targetName && v.resolvedType === current.resolvedType);
            const target = candidates.find((v) => v.collectionId === current.collectionId) ?? candidates[0];
            if (!target) {
                misses.push(`${draft.name} · ${f.label}: no ${current.resolvedType.toLowerCase()} variable named "${targetName}"`);
                continue;
            }
            if (target.id === id) continue;
            next = setBinding(next, f.ref, target.id);
            swapped += 1;
        }
        return next;
    });
    return { drafts: out, swapped, misses };
};

// ---------------------------------------------------------------------------
// Generator

export interface GeneratorRoot {
    collectionId: string;
    collectionName: string;
    prefix: string;
}

/** Every group (collection + name prefix) that could seed a generator run. */
export const generatorRoots = (variables: CatalogVariable[]): GeneratorRoot[] => {
    const seen = new Map<string, GeneratorRoot>();
    for (const v of variables) {
        const parts = v.name.split("/");
        for (let i = 0; i < parts.length; i++) {
            const prefix = parts.slice(0, i).join("/");
            const key = `${v.collectionId}::${prefix}`;
            if (!seen.has(key)) seen.set(key, { collectionId: v.collectionId, collectionName: v.collectionName, prefix });
        }
    }
    return [...seen.values()].sort((a, b) => a.collectionName.localeCompare(b.collectionName) || a.prefix.localeCompare(b.prefix));
};

export const variablesUnder = (variables: CatalogVariable[], root: GeneratorRoot) =>
    variables.filter((v) => v.collectionId === root.collectionId && (root.prefix === "" || v.name.startsWith(`${root.prefix}/`)));

const relative = (name: string, prefix: string) => (prefix ? name.slice(prefix.length + 1) : name);

export interface SegmentGuess {
    segment: string;
    field: string | null;
    count: number;
}

/** The distinct last name segments under a root, each with its guessed field, for the mapping table. */
export const segmentGuesses = (kind: StyleKind, vars: CatalogVariable[], learnt: { [segment: string]: string }): SegmentGuess[] => {
    const bySegment = new Map<string, SegmentGuess>();
    for (const v of vars) {
        const segment = normaliseSegment(v.name.split("/").pop() ?? v.name);
        const existing = bySegment.get(segment);
        if (existing) {
            existing.count += 1;
            continue;
        }
        bySegment.set(segment, { segment, field: guessField(kind, v, learnt), count: 1 });
    }
    return [...bySegment.values()].sort((a, b) => a.segment.localeCompare(b.segment));
};

export interface GeneratedStyle {
    draft: StyleDraft;
    action: "create" | "update";
    bound: string[];
    warnings: string[];
}

export interface GeneratorOptions {
    kind: StyleKind;
    root: GeneratorRoot;
    /** segment → field id ("" = ignore). Applied after guessing. */
    mapping: { [segment: string]: string };
    /** `{path}` = group path below the root, `{name}` = last segment of that path. */
    nameTemplate: string;
    variables: CatalogVariable[];
    existing: StyleDraft[];
    index: CatalogIndex;
}

const applyName = (template: string, path: string) =>
    (template || "{path}").replace(/\{path\}/g, path).replace(/\{name\}/g, path.split("/").pop() ?? path).replace(/^\/+|\/+$/g, "");

const shadowRef = (draft: StyleDraft, field: VariableBindableEffectField): FieldRef => {
    const layer = draft.effects!.findIndex((e) => isShadow(e) || (field === "radius" && e.type.endsWith("BLUR")));
    return { kind: "effect", layer: Math.max(0, layer), field };
};

const refFor = (kind: StyleKind, draft: StyleDraft, fieldId: string): FieldRef => {
    switch (kind) {
        case "PAINT": return { kind: "paint", layer: 0 };
        case "TEXT": return { kind: "text", field: fieldId as never };
        case "EFFECT": return shadowRef(draft, fieldId as VariableBindableEffectField);
        case "GRID": return { kind: "grid", layer: 0, field: fieldId as VariableBindableLayoutGridField };
    }
};

/** Makes sure an existing draft has the layer the generator is about to bind into. */
const ensureLayer = (kind: StyleKind, draft: StyleDraft): StyleDraft => {
    if (kind === "PAINT" && !(draft.paints ?? []).some((p) => p.type === "SOLID")) return { ...draft, paints: [...(draft.paints ?? []), newDraft("PAINT", "").paints![0]] };
    if (kind === "EFFECT" && !(draft.effects ?? []).some((e) => isShadow(e))) return { ...draft, effects: [defaultShadow(), ...(draft.effects ?? [])] };
    if (kind === "GRID" && (draft.grids ?? []).length === 0) return { ...draft, grids: [defaultGrid()] };
    if (kind === "TEXT" && !draft.text) return { ...draft, text: defaultText() };
    return draft;
};

/**
 * Builds one style per group under the root (one per variable for colour).
 * Bound values are also written as raw values (default mode), so the stored
 * style already looks right before Figma resolves the binding — and the text
 * style's base font matches the font its variables point at.
 */
export const generateStyles = (opts: GeneratorOptions): GeneratedStyle[] => {
    const { kind, root, mapping, variables, existing, index } = opts;
    const vars = variablesUnder(variables, root);
    const groups = new Map<string, CatalogVariable[]>();

    if (kind === "PAINT") {
        for (const v of vars) if (v.resolvedType === "COLOR") groups.set(relative(v.name, root.prefix), [v]);
    } else {
        for (const v of vars) {
            const rel = relative(v.name, root.prefix);
            const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : root.prefix.split("/").pop() ?? "";
            if (!groups.has(parent)) groups.set(parent, []);
            groups.get(parent)!.push(v);
        }
    }

    const out: GeneratedStyle[] = [];
    for (const [path, members] of groups) {
        const name = applyName(opts.nameTemplate, path);
        if (!name) continue;
        const match = existing.find((d) => d.kind === kind && d.name === name);
        let draft = ensureLayer(kind, match ? JSON.parse(JSON.stringify(match)) : newDraft(kind, name));
        const bound: string[] = [];
        const warnings: string[] = [];
        const used = new Set<string>();

        for (const v of members) {
            const fieldId = kind === "PAINT" ? "color" : (() => {
                const segment = normaliseSegment(v.name.split("/").pop() ?? v.name);
                return segment in mapping ? mapping[segment] || null : guessField(kind, v);
            })();
            if (!fieldId) continue;
            const spec = fieldSpec(kind, fieldId);
            if (!spec || compatibility(spec, v) === "incompatible") {
                warnings.push(`${v.name}: a ${v.resolvedType.toLowerCase()} can't fill ${spec?.label ?? fieldId}.`);
                continue;
            }
            if (used.has(fieldId)) {
                warnings.push(`${v.name}: ${spec.label} is already taken by another token in this group.`);
                continue;
            }
            used.add(fieldId);
            if (kind === "EFFECT" && fieldId === "radius" && !(draft.effects ?? []).length) draft = { ...draft, effects: [defaultBlur()] };
            const ref = refFor(kind, draft, fieldId);
            const value = resolveVariableValue(v.id, index, {});
            if (value !== undefined && typeof value !== "boolean") draft = setRaw(draft, ref, value as RawValue);
            draft = setBinding(draft, ref, v.id);
            bound.push(`${spec.label} ← ${v.name}`);
        }

        if (bound.length === 0) continue;
        out.push({ draft, action: match ? "update" : "create", bound, warnings });
    }
    return out.sort((a, b) => a.draft.name.localeCompare(b.draft.name));
};
