/// <reference types="@figma/plugin-typings" />
import type { Catalog, CatalogCollection, CatalogValue, CatalogVariable } from "./types";

/**
 * Builds the variable catalogue the composer's token picker and previews
 * work from: every local collection (extended collections included), every
 * local variable, and any remote variable already referenced by a style.
 * Library variables that aren't in the file yet are added separately by
 * {@link loadLibraryVariables}, because the team-library calls are slow.
 */

const toCollection = (c: VariableCollection): CatalogCollection => {
    const ext = c.isExtension ? (c as unknown as ExtendedVariableCollection) : null;
    return {
        id: c.id,
        name: c.name,
        defaultModeId: c.defaultModeId,
        modes: ext
            ? ext.modes.map((m) => ({ modeId: m.modeId, name: m.name, parentModeId: m.parentModeId }))
            : c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
        isExtension: c.isExtension,
        parentId: ext?.parentVariableCollectionId,
        remote: c.remote,
    };
};

const toVariable = (v: Variable, collection: VariableCollection | null): CatalogVariable => ({
    id: v.id,
    key: v.key,
    name: v.name,
    collectionId: v.variableCollectionId,
    collectionName: collection?.name ?? "",
    resolvedType: v.resolvedType,
    scopes: [...v.scopes],
    valuesByMode: { ...(v.valuesByMode as { [modeId: string]: CatalogValue }) },
    remote: v.remote,
});

/**
 * Folds every extended collection's modes into the variables it extends, so
 * a variable's `valuesByMode` answers for extension modes too: the override
 * where there is one, otherwise the parent mode's value.
 */
const foldExtensions = (collections: VariableCollection[], byId: Map<string, CatalogVariable>) => {
    for (const c of collections) {
        if (!c.isExtension) continue;
        const ext = c as unknown as ExtendedVariableCollection;
        for (const variableId of ext.variableIds) {
            const v = byId.get(variableId);
            if (!v) continue;
            const overrides = ext.variableOverrides[variableId] ?? {};
            for (const mode of ext.modes) {
                const value = overrides[mode.modeId] ?? v.valuesByMode[mode.parentModeId];
                if (value !== undefined) v.valuesByMode[mode.modeId] = value as CatalogValue;
            }
        }
    }
};

export async function buildLocalCatalog(extraVariableIds: Iterable<string> = []): Promise<Catalog> {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();
    const collectionById = new Map(collections.map((c) => [c.id, c]));

    const catalogVars = variables.map((v) => toVariable(v, collectionById.get(v.variableCollectionId) ?? null));
    const byId = new Map(catalogVars.map((v) => [v.id, v]));
    const catalogCollections = collections.map(toCollection);

    // Remote variables a style already uses (or an alias points at) aren't in
    // the local lists; pull them in so their names and values can be shown.
    const pending = [...extraVariableIds];
    for (const v of catalogVars) {
        for (const value of Object.values(v.valuesByMode)) {
            if (isAlias(value)) pending.push(value.id);
        }
    }
    const seenCollections = new Set(catalogCollections.map((c) => c.id));
    while (pending.length > 0) {
        const id = pending.pop()!;
        if (byId.has(id)) continue;
        const variable = await figma.variables.getVariableByIdAsync(id).catch(() => null);
        if (!variable) continue;
        const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId).catch(() => null);
        if (collection && !seenCollections.has(collection.id)) {
            seenCollections.add(collection.id);
            catalogCollections.push(toCollection(collection));
        }
        const entry = toVariable(variable, collection);
        catalogVars.push(entry);
        byId.set(id, entry);
        for (const value of Object.values(entry.valuesByMode)) {
            if (isAlias(value)) pending.push(value.id);
        }
    }

    foldExtensions(collections, byId);
    return { collections: catalogCollections, variables: catalogVars };
}

/**
 * Lists the variables of every enabled library, skipping those already in
 * the file. Their values are unknown until they are imported, so they carry
 * only name, type and key; scopes are unknown too and treated as unscoped.
 */
export async function loadLibraryVariables(known: Catalog): Promise<Catalog> {
    const knownKeys = new Set(known.variables.map((v) => v.key).filter(Boolean));
    const collections: CatalogCollection[] = [];
    const variables: CatalogVariable[] = [];
    try {
        const libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
        for (const lc of libraryCollections) {
            const collectionId = `lib:${lc.key}`;
            const libraryVariables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(lc.key);
            const fresh = libraryVariables.filter((lv) => !knownKeys.has(lv.key));
            if (fresh.length === 0) continue;
            collections.push({
                id: collectionId,
                name: lc.name,
                defaultModeId: "",
                modes: [],
                isExtension: false,
                remote: true,
                libraryName: lc.libraryName,
            });
            for (const lv of fresh) {
                variables.push({
                    id: `lib:${lv.key}`,
                    key: lv.key,
                    name: lv.name,
                    collectionId,
                    collectionName: lc.name,
                    resolvedType: lv.resolvedType,
                    scopes: [],
                    valuesByMode: {},
                    remote: true,
                    unimported: true,
                    libraryName: lc.libraryName,
                });
            }
        }
        return { collections, variables };
    } catch (error) {
        return {
            collections,
            variables,
            libraryError: error instanceof Error ? error.message : String(error),
        };
    }
}

export const isAlias = (value: unknown): value is VariableAlias =>
    typeof value === "object" && value !== null && (value as VariableAlias).type === "VARIABLE_ALIAS";

/**
 * Resolves a catalogue id to a real Variable, importing library variables by
 * key on first use. Returns null (and records why) when that isn't possible.
 */
export async function resolveVariable(id: string, warnings: string[], cache: Map<string, Variable | null>): Promise<Variable | null> {
    if (cache.has(id)) return cache.get(id)!;
    let variable: Variable | null = null;
    try {
        if (id.startsWith("lib:")) {
            variable = await figma.variables.importVariableByKeyAsync(id.slice(4));
        } else {
            variable = await figma.variables.getVariableByIdAsync(id);
        }
    } catch (error) {
        warnings.push(`Couldn't load variable ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!variable && !warnings.some((w) => w.includes(id))) {
        warnings.push(`Variable ${id} no longer exists; that field was left unbound.`);
    }
    cache.set(id, variable);
    return variable;
}
