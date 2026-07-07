import { cssColorToRgba } from "./color";
import { getMatchingModeName } from "./variableUtils";
import type { ImportSummary } from "../types.d";

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/**
 * Fallback mapping from DTCG `$type` names to Figma's raw resolved types, used
 * when a leaf has neither `$extensions.figma.resolvedType` (current shape)
 * nor a raw `$type` (legacy shape) to read the resolved type from directly —
 * i.e. a plain DTCG token file that was never a VarVar export.
 */
const DTCG_TYPE_TO_RESOLVED_TYPE: Record<string, VariableResolvedDataType> = {
  color: "COLOR",
  dimension: "FLOAT",
  number: "FLOAT",
  fontWeight: "FLOAT",
  boolean: "BOOLEAN",
  string: "STRING",
  fontFamily: "STRING",
};

interface ImportFileEntry {
  collection: string;
  mode: string;
  variables: Record<string, unknown>;
}

interface ImportRecord {
  collectionName: string;
  modeName: string;
  pathParts: string[];
  resolvedType: VariableResolvedDataType;
  scopes: VariableScope[];
  description: string;
  rawValue: unknown;
}

function isTokenLeaf(node: unknown): node is Record<string, unknown> {
  return (
    typeof node === "object" &&
    node !== null &&
    "$type" in node &&
    "$value" in node
  );
}

/**
 * Reads a token leaf produced by the current (v3.x, `$extensions.figma`) or
 * legacy (v2.x, sibling `$scopes`, raw `$type`) exporter shape, falling back
 * to mapping a plain DTCG `$type` (e.g. hand-authored token files) when
 * neither is present. Returns `undefined` `resolvedType` if the type can't be
 * resolved at all.
 */
function normalizeLeaf(node: Record<string, unknown>): {
  resolvedType: VariableResolvedDataType | undefined;
  scopes: VariableScope[];
  description: string;
  rawValue: unknown;
} {
  const extensions = node.$extensions as { figma?: { scopes?: VariableScope[]; resolvedType?: VariableResolvedDataType } } | undefined;
  const figma = extensions?.figma;

  const rawType = node.$type as string | undefined;
  const resolvedType = figma?.resolvedType
    ?? (rawType && validTypes.has(rawType) ? (rawType as VariableResolvedDataType) : undefined)
    ?? (rawType ? DTCG_TYPE_TO_RESOLVED_TYPE[rawType] : undefined);

  const scopes = figma?.scopes ?? (node.$scopes as VariableScope[] | undefined) ?? [];
  const description = (node.$description as string) ?? "";

  return { resolvedType, scopes, description, rawValue: node.$value };
}

function walkVariables(
  variables: Record<string, unknown>,
  collectionName: string,
  modeName: string,
  pathParts: string[],
  records: ImportRecord[],
  warnings: string[]
): void {
  for (const [key, node] of Object.entries(variables)) {
    if (isTokenLeaf(node)) {
      const { resolvedType, scopes, description, rawValue } = normalizeLeaf(node);
      const path = [...pathParts, key].join("/");
      if (!resolvedType || !validTypes.has(resolvedType)) {
        warnings.push(`Skipped "${path}" in "${collectionName}" (${modeName}): unrecognized or unsupported $type "${String(node.$type)}".`);
        continue;
      }
      records.push({
        collectionName,
        modeName,
        pathParts: [...pathParts, key],
        resolvedType,
        scopes,
        description,
        rawValue,
      });
    } else if (typeof node === "object" && node !== null) {
      walkVariables(node as Record<string, unknown>, collectionName, modeName, [...pathParts, key], records, warnings);
    }
  }
}

/**
 * Parses and merges every raw JSON file's `{collection, mode, variables}[]`
 * array into a flat list of per-variable-per-mode records.
 */
function collectRecords(rawFiles: string[]): { records: ImportRecord[]; warnings: string[] } {
  const records: ImportRecord[] = [];
  const warnings: string[] = [];

  for (const raw of rawFiles) {
    const entries: ImportFileEntry[] = JSON.parse(raw);
    for (const entry of entries) {
      walkVariables(entry.variables, entry.collection, entry.mode, [], records, warnings);
    }
  }

  return { records, warnings };
}

interface AliasReference {
  collectionName: string;
  modeName: string;
  path: string;
}

/**
 * Parses a `$.Collection.Mode.path` (or same-collection `$..Mode.path`)
 * alias-reference string back into its parts. Returns `null` for anything
 * that isn't the alias-reference convention (including `"_unlinked"`).
 */
export function parseAliasReference(value: unknown, currentCollectionName: string): AliasReference | null {
  if (typeof value !== "string" || !value.startsWith("$.")) {
    return null;
  }

  const remainder = value.slice(2);
  const sameCollection = remainder.startsWith(".");
  const body = sameCollection ? remainder.slice(1) : remainder;

  const parts = body.split(".");
  if (sameCollection) {
    const [modeName, ...pathParts] = parts;
    if (!modeName || pathParts.length === 0) return null;
    return { collectionName: currentCollectionName, modeName, path: pathParts.join("/") };
  }

  const [collectionName, modeName, ...pathParts] = parts;
  if (!collectionName || !modeName || pathParts.length === 0) return null;
  return { collectionName, modeName, path: pathParts.join("/") };
}

function parseLiteralValue(
  rawValue: unknown,
  resolvedType: VariableResolvedDataType
): VariableValue {
  switch (resolvedType) {
    case "COLOR":
      return cssColorToRgba(String(rawValue));
    case "FLOAT":
      return parseFloat(String(rawValue));
    case "BOOLEAN":
      return Boolean(rawValue);
    default:
      return String(rawValue);
  }
}

/**
 * Imports a set of previously-exported VarVar JSON files into the current
 * Figma document: recreates collections, modes and variables, sets literal
 * values, and resolves the plugin's `$.Collection.Mode.path` alias-reference
 * convention back into real Figma variable aliases.
 *
 * @param rawFiles - Raw JSON text of each selected file
 * @param replaceExisting - If true, every existing local variable collection
 *   is deleted before importing (a clean re-sync instead of an additive merge)
 */
export async function importVariables(rawFiles: string[], replaceExisting: boolean): Promise<ImportSummary> {
  const summary: ImportSummary = {
    collectionsCreated: 0,
    collectionsReused: 0,
    modesCreated: 0,
    variablesCreated: 0,
    variablesUpdated: 0,
    valuesSet: 0,
    aliasesResolved: 0,
    warnings: [],
  };

  const { records, warnings: parseWarnings } = collectRecords(rawFiles);
  summary.warnings.push(...parseWarnings);

  if (records.length === 0) {
    summary.warnings.push("No importable variables were found in the selected file(s) — nothing was changed.");
    return summary;
  }

  if (replaceExisting) {
    const existing = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of existing) {
      collection.remove();
    }
  }

  // --- Phase 1: collections & modes ---
  const collectionsByName = new Map<string, VariableCollection>();
  {
    const existing = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of existing) {
      collectionsByName.set(collection.name, collection);
    }
  }

  const modeNamesByCollection = new Map<string, string[]>();
  for (const record of records) {
    const modeNames = modeNamesByCollection.get(record.collectionName) ?? [];
    if (!modeNames.includes(record.modeName)) modeNames.push(record.modeName);
    modeNamesByCollection.set(record.collectionName, modeNames);
  }

  for (const [collectionName, modeNames] of modeNamesByCollection) {
    let collection = collectionsByName.get(collectionName);
    let isNewCollection = false;
    if (!collection) {
      collection = figma.variables.createVariableCollection(collectionName);
      collectionsByName.set(collectionName, collection);
      summary.collectionsCreated += 1;
      isNewCollection = true;
    } else {
      summary.collectionsReused += 1;
    }

    modeNames.forEach((modeName, index) => {
      const existingMode = collection!.modes.find((m) => m.name === modeName);
      if (existingMode) return;

      if (isNewCollection && index === 0) {
        // Rename the collection's auto-created default mode instead of adding a new one.
        collection!.renameMode(collection!.modes[0].modeId, modeName);
        summary.modesCreated += 1;
        return;
      }

      try {
        collection!.addMode(modeName);
        summary.modesCreated += 1;
      } catch (err) {
        summary.warnings.push(
          `Could not add mode "${modeName}" to collection "${collectionName}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  // --- Phase 2: variables ---
  const variablesByCollectionAndPath = new Map<string, Variable>();
  const seenPaths = new Set<string>();

  for (const record of records) {
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);

    const collection = collectionsByName.get(record.collectionName);
    if (!collection) continue;

    const varName = record.pathParts.join("/");
    const existingVariables = await Promise.all(
      collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id))
    );
    const existingVariable = existingVariables.find((v) => v !== null && v.name === varName) as Variable | undefined;

    let variable: Variable;
    if (existingVariable) {
      if (existingVariable.resolvedType !== record.resolvedType) {
        summary.warnings.push(
          `Skipped variable "${varName}" in "${record.collectionName}": existing type ${existingVariable.resolvedType} does not match imported type ${record.resolvedType}.`
        );
        continue;
      }
      variable = existingVariable;
      summary.variablesUpdated += 1;
    } else {
      variable = figma.variables.createVariable(varName, collection, record.resolvedType);
      summary.variablesCreated += 1;
    }

    variable.description = record.description;
    if (record.scopes.length > 0 && !record.scopes.includes("ALL_SCOPES")) {
      variable.scopes = record.scopes;
    }

    variablesByCollectionAndPath.set(pathKey, variable);
  }

  // --- Phase 3: values (literals first, then aliases so every variable already exists) ---
  const aliasRecords: ImportRecord[] = [];

  for (const record of records) {
    if (typeof record.rawValue === "string" && record.rawValue === "_unlinked") {
      summary.warnings.push(
        `Skipped unlinked reference for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}).`
      );
      continue;
    }
    if (parseAliasReference(record.rawValue, record.collectionName)) {
      aliasRecords.push(record);
      continue;
    }

    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    const variable = variablesByCollectionAndPath.get(pathKey);
    const collection = collectionsByName.get(record.collectionName);
    if (!variable || !collection) continue;

    const mode = collection.modes.find((m) => m.name === record.modeName);
    if (!mode) continue;

    try {
      variable.setValueForMode(mode.modeId, parseLiteralValue(record.rawValue, record.resolvedType));
      summary.valuesSet += 1;
    } catch (err) {
      summary.warnings.push(
        `Failed to set value for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  for (const record of aliasRecords) {
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    const variable = variablesByCollectionAndPath.get(pathKey);
    const collection = collectionsByName.get(record.collectionName);
    if (!variable || !collection) continue;

    const mode = collection.modes.find((m) => m.name === record.modeName);
    if (!mode) continue;

    const ref = parseAliasReference(record.rawValue, record.collectionName)!;
    const targetCollection = collectionsByName.get(ref.collectionName)
      ?? (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === ref.collectionName);

    if (!targetCollection) {
      summary.warnings.push(
        `Could not resolve alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): collection "${ref.collectionName}" not found.`
      );
      continue;
    }

    const targetModeName = getMatchingModeName(ref.modeName, targetCollection);
    const targetModeId = targetCollection.modes.find((m) => m.name === targetModeName)?.modeId;

    const targetVariables = await Promise.all(
      targetCollection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id))
    );
    const targetVariable = targetVariables.find((v) => v !== null && v.name === ref.path) as Variable | undefined;

    if (!targetVariable || !targetModeId) {
      summary.warnings.push(
        `Could not resolve alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): variable "${ref.path}" not found in "${ref.collectionName}".`
      );
      continue;
    }

    try {
      variable.setValueForMode(mode.modeId, figma.variables.createVariableAlias(targetVariable));
      summary.aliasesResolved += 1;
      summary.valuesSet += 1;
    } catch (err) {
      summary.warnings.push(
        `Failed to set alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return summary;
}
