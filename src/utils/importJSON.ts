import { cssColorToRgba } from "./color";
import { ImportMode } from "../types.d";
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

/**
 * True if this is the plugin's `$.Collection.Mode.path` alias-reference
 * convention (as opposed to a literal value or `"_unlinked"`).
 */
function isAliasValue(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("$.") && value !== "_unlinked";
}

interface AliasTarget {
  collectionName: string;
  modeName: string;
  path: string;
}

/**
 * Splits `body` on the longest name in `names` that it starts with, as
 * `"<name>.<rest>"`. Matching against known names (rather than blindly
 * splitting on every "." ) is what lets collection/mode/group names that
 * themselves contain literal dots round-trip correctly.
 */
function splitOnKnownName(body: string, names: string[]): { name: string; rest: string } | undefined {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (body.startsWith(`${name}.`)) {
      return { name, rest: body.slice(name.length + 1) };
    }
  }
  return undefined;
}

/**
 * Resolves a `$.Collection.Mode.path` (or same-collection `$..Mode.path`)
 * alias-reference string into every plausible `{collection, mode, path}`
 * interpretation, most-specific first. The convention's own "." separator
 * is ambiguous with a literal "." inside a collection/mode/group name (e.g.
 * a collection named ".Brand"), so this can't be resolved by string-splitting
 * alone — instead it's matched against the actual known collection/mode
 * names, and the caller validates each candidate against real variables
 * until one resolves.
 */
function resolveAliasCandidates(
  value: string,
  currentCollectionName: string,
  collectionsByName: Map<string, VariableCollection>
): AliasTarget[] {
  const remainder = value.slice(2);
  const candidates: AliasTarget[] = [];

  // Explicit "$.Collection.Mode.path" form — tried first since matching an
  // actual known collection name is stronger evidence than the generic
  // same-collection fallback below.
  const collectionNames = [...collectionsByName.keys()].sort((a, b) => b.length - a.length);
  for (const collectionName of collectionNames) {
    if (!remainder.startsWith(`${collectionName}.`)) continue;
    const rest = remainder.slice(collectionName.length + 1);
    const split = splitOnKnownName(rest, collectionsByName.get(collectionName)!.modes.map((m) => m.name));
    if (split) {
      candidates.push({ collectionName, modeName: split.name, path: split.rest.replace(/\./g, "/") });
    }
  }

  // Same-collection "$..Mode.path" form (empty collection segment).
  if (remainder.startsWith(".")) {
    const currentCollection = collectionsByName.get(currentCollectionName);
    if (currentCollection) {
      const split = splitOnKnownName(remainder.slice(1), currentCollection.modes.map((m) => m.name));
      if (split) {
        candidates.push({ collectionName: currentCollectionName, modeName: split.name, path: split.rest.replace(/\./g, "/") });
      }
    }
  }

  return candidates;
}

/**
 * Figma treats a `.` or `_`-prefixed name segment as "private" — hidden from
 * publishing when the file is shared as a library — for collections,
 * variables, components, and styles alike. A collection or variable whose
 * name (or any group segment of it) starts with either prefix is recreated
 * on import with `hiddenFromPublishing` set, so that intent survives the
 * round-trip rather than just looking private without actually being so.
 */
function hasPrivateNamingConvention(name: string): boolean {
  return name.split("/").some((segment) => segment.startsWith(".") || segment.startsWith("_"));
}

async function findVariableByName(collection: VariableCollection, name: string): Promise<Variable | undefined> {
  const variables = await Promise.all(
    collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id))
  );
  return variables.find((v): v is Variable => v !== null && v.name === name);
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
 * @param importMode - How to reconcile the import against existing local
 *   collections: additive merge, update-existing-only, merge-then-prune
 *   (sync), or wipe-then-import (clean). See {@link ImportMode}.
 */
export async function importVariables(rawFiles: string[], importMode: ImportMode): Promise<ImportSummary> {
  const summary: ImportSummary = {
    collectionsCreated: 0,
    collectionsReused: 0,
    collectionsDeleted: 0,
    modesCreated: 0,
    modesDeleted: 0,
    variablesCreated: 0,
    variablesUpdated: 0,
    variablesDeleted: 0,
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

  if (importMode === ImportMode.CLEAN) {
    const existing = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of existing) {
      collection.remove();
      summary.collectionsDeleted += 1;
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
      // Update-only never creates: a collection missing locally means every
      // record under it is skipped entirely (handled by the `!collection`
      // guards in phases 2/3 below).
      if (importMode === ImportMode.UPDATE_ONLY) continue;

      collection = figma.variables.createVariableCollection(collectionName);
      if (hasPrivateNamingConvention(collectionName)) {
        collection.hiddenFromPublishing = true;
      }
      collectionsByName.set(collectionName, collection);
      summary.collectionsCreated += 1;
      isNewCollection = true;
    } else {
      summary.collectionsReused += 1;
    }

    modeNames.forEach((modeName, index) => {
      const existingMode = collection!.modes.find((m) => m.name === modeName);
      if (existingMode) return;
      if (importMode === ImportMode.UPDATE_ONLY) return;

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
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);

    const collection = collectionsByName.get(record.collectionName);
    if (!collection) continue;

    const varName = record.pathParts.join("/");
    const existingVariable = await findVariableByName(collection, varName);

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
      // Update-only never creates a variable that doesn't already exist.
      if (importMode === ImportMode.UPDATE_ONLY) continue;

      variable = figma.variables.createVariable(varName, collection, record.resolvedType);
      if (hasPrivateNamingConvention(varName)) {
        variable.hiddenFromPublishing = true;
      }
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
    if (isAliasValue(record.rawValue)) {
      aliasRecords.push(record);
      continue;
    }

    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
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
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    const variable = variablesByCollectionAndPath.get(pathKey);
    const collection = collectionsByName.get(record.collectionName);
    if (!variable || !collection) continue;

    const mode = collection.modes.find((m) => m.name === record.modeName);
    if (!mode) continue;

    const candidates = resolveAliasCandidates(record.rawValue as string, record.collectionName, collectionsByName);

    let resolvedTarget: { modeId: string; variable: Variable } | undefined;
    for (const candidate of candidates) {
      const targetCollection = collectionsByName.get(candidate.collectionName);
      const targetModeId = targetCollection?.modes.find((m) => m.name === candidate.modeName)?.modeId;
      if (!targetCollection || !targetModeId) continue;

      const targetVariable = await findVariableByName(targetCollection, candidate.path);
      if (targetVariable) {
        resolvedTarget = { modeId: targetModeId, variable: targetVariable };
        break;
      }
    }

    if (!resolvedTarget) {
      summary.warnings.push(
        `Could not resolve alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): value "${record.rawValue}" did not match any known collection/mode/variable.`
      );
      continue;
    }

    try {
      variable.setValueForMode(mode.modeId, figma.variables.createVariableAlias(resolvedTarget.variable));
      summary.aliasesResolved += 1;
      summary.valuesSet += 1;
    } catch (err) {
      summary.warnings.push(
        `Failed to set alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // --- Phase 4: prune (SYNC only) — after merging, delete anything anywhere
  // in the document that isn't present in the imported file: whole
  // collections the file never mentions, and leftover variables/modes inside
  // collections it does mention.
  if (importMode === ImportMode.SYNC) {
    for (const collection of collectionsByName.values()) {
      const modeNames = modeNamesByCollection.get(collection.name);

      if (!modeNames) {
        // Not present in the file at all — delete the whole collection.
        collection.remove();
        summary.collectionsDeleted += 1;
        continue;
      }

      const keptVariableNames = new Set(
        records
          .filter((record) => record.collectionName === collection.name)
          .map((record) => record.pathParts.join("/"))
      );

      const existingVariables = await Promise.all(
        collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id))
      );
      for (const variable of existingVariables) {
        if (variable && !keptVariableNames.has(variable.name)) {
          variable.remove();
          summary.variablesDeleted += 1;
        }
      }

      for (const mode of collection.modes) {
        if (modeNames.includes(mode.name)) continue;
        try {
          collection.removeMode(mode.modeId);
          summary.modesDeleted += 1;
        } catch (err) {
          summary.warnings.push(
            `Could not remove mode "${mode.name}" from collection "${collection.name}": ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  return summary;
}
