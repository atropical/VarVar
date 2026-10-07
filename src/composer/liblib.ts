import { defaultText } from "./model";
import type { CatalogVariable, StyleDraft, StyleKind, TextProps } from "./types";

/**
 * Applying a LibLib library snapshot (https://github.com/atropical/liblib):
 * its `styles[]` records describe how the styles should look, VarVar turns
 * them into drafts. Records match existing styles by key, so a changed name
 * is a rename, not a delete plus a create.
 *
 * Only JSON snapshots are read. TOON files must be converted first
 * (`npx @atropical/liblib` can do that).
 */

/**
 * LibLib snapshot schemas this version of VarVar can apply. Within @1, a
 * record's optional `bindings` (collection-qualified, LibLib plugin 2.3.0+ / reader 0.2.0)
 * is used when present; without it bindings fall back to names alone.
 */
export const SUPPORTED_LIBLIB_SCHEMAS = ["liblib/design-system-snapshot@1"] as const;

/**
 * Where a style binds a variable, keyed by its path inside `value`
 * (e.g. "paints[0].boundVariables.color"). Added by LibLib without a schema
 * bump, so it is feature-detected: older snapshots don't have it.
 */
interface StyleBinding {
    name: string;
    collection: string | null;
    key: string | null;
}

interface StyleRecord {
    key?: string;
    name: string;
    type: StyleKind;
    description?: string;
    value: Record<string, unknown>;
    bindings?: Record<string, StyleBinding>;
}

export interface LibLibPlan {
    schema: string;
    fileName?: string;
    /** Drafts to add: updates keep the existing style's key and id. */
    drafts: StyleDraft[];
    /** Existing style keys the snapshot doesn't mention (deleted only if the user asks). */
    missing: string[];
    counts: { create: number; update: number; rename: number };
    warnings: string[];
}

/**
 * LibLib's key for a style: the publish key when it has one, otherwise the
 * hash out of its id (`S:<hash>,…`), as `styleKeyFromId` does.
 */
export const libLibStyleKey = (draft: StyleDraft): string | undefined => {
    if (draft.libKey) return draft.libKey;
    if (!draft.id) return undefined;
    const match = /^S:([^,]+)/.exec(draft.id);
    return match ? match[1] : draft.id;
};

/**
 * A binding as LibLib writes it, resolved to a variable id. Today it is the
 * bare variable name; a `{ $var: "Collection/Name" }` object or a
 * `"{Collection/Name}"` string is accepted too, for when the collection is recorded.
 */
const resolveBinding = (
    raw: unknown,
    variables: CatalogVariable[],
    where: string,
    warnings: string[],
    hint?: StyleBinding,
): VariableAlias | undefined => {
    if (hint && !hint.name.startsWith("unresolved:")) {
        // The variable's key identifies it exactly; collection + name is the next best.
        const byKey = hint.key ? variables.find((v) => v.key === hint.key) : undefined;
        if (byKey) return { type: "VARIABLE_ALIAS", id: byKey.id };
        const byName = variables.filter((v) => v.name === hint.name && (hint.collection === null || v.collectionName === hint.collection));
        if (byName.length > 0) return { type: "VARIABLE_ALIAS", id: (byName.find((v) => !v.unimported) ?? byName[0]).id };
        warnings.push(`${where}: no variable "${hint.collection ? `${hint.collection}/` : ""}${hint.name}" in this file, so the field is left unbound.`);
        return undefined;
    }
    let ref: string | undefined;
    if (typeof raw === "string") ref = raw;
    else if (raw && typeof raw === "object" && typeof (raw as { $var?: unknown }).$var === "string") ref = (raw as { $var: string }).$var;
    else if (raw && typeof raw === "object" && (raw as VariableAlias).type === "VARIABLE_ALIAS") return raw as VariableAlias;
    if (!ref) return undefined;
    if (ref.startsWith("unresolved:")) {
        warnings.push(`${where}: the snapshot couldn't name this variable (${ref}), so the field is left unbound.`);
        return undefined;
    }
    const braced = /^\{(.+)\}$/.exec(ref);
    const path = braced ? braced[1] : ref;

    // With a collection: "Collection/Name" — try that split first.
    const candidates: CatalogVariable[] = [];
    const slash = path.indexOf("/");
    if (slash > 0) {
        const collection = path.slice(0, slash);
        const name = path.slice(slash + 1);
        candidates.push(...variables.filter((v) => v.collectionName === collection && v.name === name));
    }
    if (candidates.length === 0) candidates.push(...variables.filter((v) => v.name === path));

    if (candidates.length === 0) {
        warnings.push(`${where}: no variable named "${path}" in this file, so the field is left unbound.`);
        return undefined;
    }
    const local = candidates.filter((v) => !v.unimported);
    const pick = (local.length > 0 ? local : candidates)[0];
    if (local.length > 1 || (local.length === 0 && candidates.length > 1)) {
        warnings.push(`${where}: "${path}" exists in ${candidates.length} collections; bound to the one in "${pick.collectionName}". Check it in the review.`);
    }
    return { type: "VARIABLE_ALIAS", id: pick.id };
};

interface RebindContext {
    variables: CatalogVariable[];
    warnings: string[];
    bindings?: Record<string, StyleBinding>;
}

/**
 * Walks a value and turns every `boundVariables` entry back into variable
 * aliases. `path` follows LibLib's binding paths ("paints[0].boundVariables.color").
 */
const rebind = (value: unknown, ctx: RebindContext, where: string, path: string): unknown => {
    if (Array.isArray(value)) return value.map((v, i) => rebind(v, ctx, `${where} ${i + 1}`, `${path}[${i}]`));
    if (!value || typeof value !== "object") return value;
    const join = (key: string) => (path ? `${path}.${key}` : key);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (key === "boundVariables" && item && typeof item === "object") {
            const bound: Record<string, unknown> = {};
            for (const [field, raw] of Object.entries(item as Record<string, unknown>)) {
                const fieldPath = `${join(key)}.${field}`;
                if (Array.isArray(raw)) {
                    const list = raw
                        .map((r, i) => resolveBinding(r, ctx.variables, `${where} · ${field}`, ctx.warnings, ctx.bindings?.[`${fieldPath}[${i}]`]))
                        .filter(Boolean);
                    if (list.length) bound[field] = list;
                } else {
                    const alias = resolveBinding(raw, ctx.variables, `${where} · ${field}`, ctx.warnings, ctx.bindings?.[fieldPath]);
                    if (alias) bound[field] = alias;
                }
            }
            out[key] = bound;
        } else {
            out[key] = rebind(item, ctx, where, join(key));
        }
    }
    return out;
};

const toText = (value: Record<string, unknown>): TextProps => {
    const base = defaultText();
    const v = value as Partial<TextProps> & { fontName?: FontName & { variationSettings?: unknown } };
    return {
        ...base,
        ...v,
        // variationSettings is informational on read; Figma derives it from the style name.
        fontName: v.fontName ? { family: v.fontName.family, style: v.fontName.style } : base.fontName,
        boundVariables: (v.boundVariables ?? {}) as TextProps["boundVariables"],
    };
};

const recordToDraft = (record: StyleRecord, base: StyleDraft): StyleDraft => {
    const draft: StyleDraft = { ...base, name: record.name, description: record.description ?? "" };
    const value = record.value ?? {};
    switch (record.type) {
        case "PAINT": return { ...draft, paints: (value.paints ?? []) as Paint[] };
        case "EFFECT": return { ...draft, effects: (value.effects ?? []) as Effect[] };
        case "GRID": return { ...draft, grids: (value.layoutGrids ?? []) as LayoutGrid[] };
        case "TEXT": return { ...draft, text: toText(value) };
    }
};

const KINDS: StyleKind[] = ["PAINT", "TEXT", "EFFECT", "GRID"];

/**
 * Reads a LibLib JSON snapshot and plans the drafts it implies against the
 * styles in this file. Throws with a readable message for anything that
 * isn't a supported library snapshot.
 */
export const planFromLibLib = (
    text: string,
    existing: StyleDraft[],
    variables: CatalogVariable[],
    newKey: () => string,
): LibLibPlan => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("That isn't a JSON file. Export the LibLib snapshot as JSON (TOON files aren't read here).");
    }
    const root = parsed as { schema?: unknown; meta?: { fileName?: string }; styles?: unknown };
    const schema = typeof root?.schema === "string" ? root.schema : "";
    if (schema.startsWith("liblib/usage-snapshot")) {
        throw new Error("That is a LibLib usage snapshot. Export a library snapshot (Export Library Snapshot…) from the library file instead.");
    }
    if (!(SUPPORTED_LIBLIB_SCHEMAS as readonly string[]).includes(schema)) {
        throw new Error(
            `Unsupported LibLib snapshot schema "${schema || "none"}". This version of VarVar supports ${SUPPORTED_LIBLIB_SCHEMAS.join(", ")}.`,
        );
    }
    if (!Array.isArray(root.styles)) throw new Error("The snapshot has no styles[] section — export it with styles included.");

    const warnings: string[] = [];
    const byKey = new Map<string, StyleDraft>();
    for (const d of existing) {
        const key = libLibStyleKey(d);
        if (key) byKey.set(key, d);
    }

    const drafts: StyleDraft[] = [];
    const seen = new Set<string>();
    const counts = { create: 0, update: 0, rename: 0 };
    for (const raw of root.styles as StyleRecord[]) {
        if (!raw || typeof raw.name !== "string" || !KINDS.includes(raw.type)) {
            warnings.push(`Skipped a style record without a name or with an unknown type (${JSON.stringify(raw?.type)}).`);
            continue;
        }
        const value = rebind(raw.value ?? {}, { variables, warnings, bindings: raw.bindings }, raw.name, "") as Record<string, unknown>;
        const record = { ...raw, value };
        const match = raw.key ? byKey.get(raw.key) : undefined;
        if (match && match.kind !== raw.type) {
            warnings.push(`${raw.name}: key matches a ${match.kind.toLowerCase()} style in this file but the record is ${raw.type.toLowerCase()}; skipped.`);
            continue;
        }
        if (match) {
            seen.add(match.key);
            drafts.push(recordToDraft(record, match));
            counts.update += 1;
            if (match.name !== raw.name) counts.rename += 1;
        } else {
            if (raw.key) warnings.push(`${raw.name}: no style with key ${raw.key} in this file, so it will be created as a new style.`);
            drafts.push(recordToDraft(record, { key: newKey(), kind: raw.type, name: raw.name, description: "" }));
            counts.create += 1;
        }
    }

    const missing = existing.filter((d) => d.id && !seen.has(d.key)).map((d) => d.key);
    return { schema, fileName: root.meta?.fileName, drafts, missing, counts, warnings };
};
