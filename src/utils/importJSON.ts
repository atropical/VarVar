import { cssColorToRgba, rgbToCssColor } from "./color";
import { ImportMode } from "../types.d";
import type { ImportSummary, ImportDiff, ImportDiffVariable } from "../types.d";

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
  collectionRefsByName: Map<string, CollectionRef>
): AliasTarget[] {
  const remainder = value.slice(2);
  const candidates: AliasTarget[] = [];

  // Explicit "$.Collection.Mode.path" form — tried first since matching an
  // actual known collection name is stronger evidence than the generic
  // same-collection fallback below.
  const collectionNames = [...collectionRefsByName.keys()].sort((a, b) => b.length - a.length);
  for (const collectionName of collectionNames) {
    if (!remainder.startsWith(`${collectionName}.`)) continue;
    const rest = remainder.slice(collectionName.length + 1);
    const split = splitOnKnownName(rest, collectionRefsByName.get(collectionName)!.modes.map((m) => m.name));
    if (split) {
      candidates.push({ collectionName, modeName: split.name, path: split.rest.replace(/\./g, "/") });
    }
  }

  // Same-collection "$..Mode.path" form (empty collection segment).
  if (remainder.startsWith(".")) {
    const currentCollection = collectionRefsByName.get(currentCollectionName);
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

function isAliasStoredValue(value: VariableValue | undefined): value is VariableAlias {
  return typeof value === "object" && value !== null && (value as VariableAlias).type === "VARIABLE_ALIAS";
}

function formatLiteral(value: VariableValue, type: VariableResolvedDataType): string {
  if (type === "COLOR") return rgbToCssColor(value as RGBA);
  return String(value);
}

/** Renders a stored (pre-existing) variable value for diff display, resolving alias targets by name. */
async function formatStoredValue(value: VariableValue | undefined, type: VariableResolvedDataType): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (isAliasStoredValue(value)) {
    const target = await figma.variables.getVariableByIdAsync(value.id);
    return target ? `→ ${target.name}` : "→ (broken alias)";
  }
  return formatLiteral(value, type);
}

/**
 * Whether an existing stored value already equals the literal value about to
 * be imported. `after` always came from parsing an exported file, so for
 * COLOR it can never be more precise than the export format's own
 * quantization (`rgbToCssColor`: 8-bit per RGB channel, 2 decimal places for
 * alpha) — comparing at full float precision against a native Figma color
 * (which isn't necessarily on that grid) would report a "change" on every
 * re-import of a file exported by this same plugin. Both sides are rounded
 * to that grid before comparing, so only a color that's actually different
 * once round-tripped through the export format counts as changed.
 */
function literalValueEquals(before: VariableValue | undefined, after: VariableValue, type: VariableResolvedDataType): boolean {
  if (before === undefined || isAliasStoredValue(before)) return false;
  if (type === "COLOR") {
    const a = before as RGBA;
    const b = after as RGBA;
    const ch = (n: number) => Math.round(n * 255);
    const alpha = (n: number) => Math.round(n * 100);
    return ch(a.r) === ch(b.r) && ch(a.g) === ch(b.g) && ch(a.b) === ch(b.b) && alpha(a.a) === alpha(b.a);
  }
  return before === after;
}

/** Whether an existing stored value is already an alias pointing at `targetId`. */
function aliasValueEquals(before: VariableValue | undefined, targetId: string | undefined): boolean {
  if (!targetId || !isAliasStoredValue(before)) return false;
  return before.id === targetId;
}

function scopesEqual(a: VariableScope[], b: VariableScope[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((s) => setB.has(s));
}

interface ModeRef {
  modeId: string;
  name: string;
  isNew: boolean;
}

interface CollectionRef {
  name: string;
  real?: VariableCollection;
  isNew: boolean;
  modes: ModeRef[];
}

interface VariableRef {
  path: string;
  collectionName: string;
  real?: Variable;
  isNew: boolean;
  resolvedType: VariableResolvedDataType;
}

function syntheticModeId(collectionName: string, modeName: string): string {
  return `new:${collectionName}:${modeName}`;
}

/**
 * Core import walk shared by dry-run preview and real execution. When
 * `dryRun` is true, every `figma.variables.*` mutation call is skipped —
 * only read APIs run — while the exact same decisions (what would be
 * created/updated/deleted) are still recorded into `diff` and `summary`.
 * This guarantees the preview a user sees and the run they confirm can
 * never drift apart, since it's the same code path either way.
 */
async function runImport(rawFiles: string[], importMode: ImportMode, dryRun: boolean): Promise<{ summary: ImportSummary; diff: ImportDiff }> {
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

  const diff: ImportDiff = { collections: [], modes: [], variables: [] };

  const { records, warnings: parseWarnings } = collectRecords(rawFiles);
  summary.warnings.push(...parseWarnings);

  if (records.length === 0) {
    summary.warnings.push("No importable variables were found in the selected file(s) — nothing was changed.");
    return { summary, diff };
  }

  const collectionRefsByName = new Map<string, CollectionRef>();

  if (importMode === ImportMode.CLEAN) {
    const toDelete = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of toDelete) {
      diff.collections.push({ name: collection.name, action: "delete" });
      summary.collectionsDeleted += 1;
      if (!dryRun) collection.remove();
    }
    // Everything downstream treats the document as if it had no existing
    // collections at all — matches the real post-deletion state in apply
    // mode, and simulates it in dry-run mode.
  } else {
    const existing = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of existing) {
      collectionRefsByName.set(collection.name, {
        name: collection.name,
        real: collection,
        isNew: false,
        modes: collection.modes.map((m) => ({ modeId: m.modeId, name: m.name, isNew: false })),
      });
    }
  }

  // --- Phase 1: collections & modes ---
  const modeNamesByCollection = new Map<string, string[]>();
  for (const record of records) {
    const modeNames = modeNamesByCollection.get(record.collectionName) ?? [];
    if (!modeNames.includes(record.modeName)) modeNames.push(record.modeName);
    modeNamesByCollection.set(record.collectionName, modeNames);
  }

  for (const [collectionName, modeNames] of modeNamesByCollection) {
    let collRef = collectionRefsByName.get(collectionName);
    let isNewCollection = false;

    if (!collRef) {
      // Update-only never creates: a collection missing locally means every
      // record under it is skipped entirely (handled by the `!collRef`
      // guards in phases 2/3 below).
      if (importMode === ImportMode.UPDATE_ONLY) continue;

      isNewCollection = true;
      const hidden = hasPrivateNamingConvention(collectionName);
      let real: VariableCollection | undefined;
      if (!dryRun) {
        real = figma.variables.createVariableCollection(collectionName);
        if (hidden) real.hiddenFromPublishing = true;
      }
      collRef = {
        name: collectionName,
        real,
        isNew: true,
        modes: [{ modeId: real ? real.modes[0].modeId : syntheticModeId(collectionName, "__default__"), name: real ? real.modes[0].name : "__default__", isNew: true }],
      };
      collectionRefsByName.set(collectionName, collRef);
      summary.collectionsCreated += 1;
      diff.collections.push({ name: collectionName, action: "create" });
    } else {
      summary.collectionsReused += 1;
      diff.collections.push({ name: collectionName, action: "reuse" });
    }

    const ref = collRef;
    modeNames.forEach((modeName, index) => {
      const existingMode = ref.modes.find((m) => m.name === modeName);
      if (existingMode) return;
      if (importMode === ImportMode.UPDATE_ONLY) return;

      if (isNewCollection && index === 0) {
        // Rename the collection's auto-created default mode instead of adding a new one.
        if (!dryRun && ref.real) {
          ref.real.renameMode(ref.modes[0].modeId, modeName);
        }
        ref.modes[0] = { modeId: ref.modes[0].modeId, name: modeName, isNew: true };
        summary.modesCreated += 1;
        diff.modes.push({ collectionName, name: modeName, action: "create" });
        return;
      }

      let modeId = syntheticModeId(collectionName, modeName);
      if (!dryRun && ref.real) {
        try {
          ref.real.addMode(modeName);
          modeId = ref.real.modes.find((m) => m.name === modeName)!.modeId;
        } catch (err) {
          summary.warnings.push(
            `Could not add mode "${modeName}" to collection "${collectionName}": ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
      }
      ref.modes.push({ modeId, name: modeName, isNew: true });
      summary.modesCreated += 1;
      diff.modes.push({ collectionName, name: modeName, action: "create" });
    });
  }

  // --- Phase 2: variables ---
  const variableRefsByPath = new Map<string, VariableRef>();
  const variableDiffByPath = new Map<string, ImportDiffVariable>();
  // Whether a *matched* (not newly-created) variable's own metadata
  // (description/scopes) actually differs from the file — combined with the
  // per-mode value diffs at the end to decide whether it was a true no-op.
  const metadataChangedByPath = new Map<string, boolean>();
  const seenPaths = new Set<string>();

  for (const record of records) {
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);

    const collRef = collectionRefsByName.get(record.collectionName);
    if (!collRef) continue;

    const varName = record.pathParts.join("/");
    let existingVariable: Variable | undefined;
    if (collRef.real) {
      existingVariable = await findVariableByName(collRef.real, varName);
    }

    let varRef: VariableRef;
    let diffEntry: ImportDiffVariable;

    if (existingVariable) {
      if (existingVariable.resolvedType !== record.resolvedType) {
        summary.warnings.push(
          `Skipped variable "${varName}" in "${record.collectionName}": existing type ${existingVariable.resolvedType} does not match imported type ${record.resolvedType}.`
        );
        continue;
      }
      varRef = { path: varName, collectionName: record.collectionName, real: existingVariable, isNew: false, resolvedType: existingVariable.resolvedType };
      diffEntry = { collectionName: record.collectionName, path: varName, action: "update", resolvedType: record.resolvedType, values: [] };

      // Only touch description/scopes — and only count this as a real
      // update — when they actually differ, so an unchanged re-import of an
      // identical file is a true no-op rather than a no-op-with-a-write.
      const willWriteScopes = record.scopes.length > 0 && !record.scopes.includes("ALL_SCOPES");
      const descriptionChanged = existingVariable.description !== record.description;
      const scopesChanged = willWriteScopes && !scopesEqual(existingVariable.scopes, record.scopes);
      metadataChangedByPath.set(pathKey, descriptionChanged || scopesChanged);

      if (!dryRun && varRef.real) {
        if (descriptionChanged) varRef.real.description = record.description;
        if (scopesChanged) varRef.real.scopes = record.scopes;
      }
    } else {
      // Update-only never creates a variable that doesn't already exist.
      if (importMode === ImportMode.UPDATE_ONLY) continue;

      const hidden = hasPrivateNamingConvention(varName);
      let real: Variable | undefined;
      if (!dryRun && collRef.real) {
        real = figma.variables.createVariable(varName, collRef.real, record.resolvedType);
        if (hidden) real.hiddenFromPublishing = true;
      }
      varRef = { path: varName, collectionName: record.collectionName, real, isNew: true, resolvedType: record.resolvedType };
      diffEntry = { collectionName: record.collectionName, path: varName, action: "create", resolvedType: record.resolvedType, values: [] };
      summary.variablesCreated += 1;

      if (!dryRun && varRef.real) {
        varRef.real.description = record.description;
        if (record.scopes.length > 0 && !record.scopes.includes("ALL_SCOPES")) {
          varRef.real.scopes = record.scopes;
        }
      }
    }

    variableRefsByPath.set(pathKey, varRef);
    variableDiffByPath.set(pathKey, diffEntry);
    diff.variables.push(diffEntry);
  }

  // --- Phase 3: values (literals first, then aliases so every variable already exists) ---
  const aliasRecords: ImportRecord[] = [];

  for (const record of records) {
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;

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

    const varRef = variableRefsByPath.get(pathKey);
    const collRef = collectionRefsByName.get(record.collectionName);
    if (!varRef || !collRef) continue;

    const modeRef = collRef.modes.find((m) => m.name === record.modeName);
    if (!modeRef) continue;

    const newValue = parseLiteralValue(record.rawValue, record.resolvedType);
    const beforeRaw = (!varRef.isNew && !modeRef.isNew && varRef.real)
      ? varRef.real.valuesByMode[modeRef.modeId]
      : undefined;
    const before = await formatStoredValue(beforeRaw, varRef.resolvedType);
    const after = formatLiteral(newValue, record.resolvedType);

    const changed = !literalValueEquals(beforeRaw, newValue, record.resolvedType);
    const diffEntry = variableDiffByPath.get(pathKey);
    diffEntry?.values.push({ modeName: record.modeName, before, after, changed });

    // Skip the write entirely when the stored value already matches — a
    // re-import of an unchanged file shouldn't touch the document at all.
    if (!changed) continue;

    if (dryRun) {
      summary.valuesSet += 1;
    } else if (varRef.real) {
      try {
        varRef.real.setValueForMode(modeRef.modeId, newValue);
        summary.valuesSet += 1;
      } catch (err) {
        summary.warnings.push(
          `Failed to set value for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  for (const record of aliasRecords) {
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    const varRef = variableRefsByPath.get(pathKey);
    const collRef = collectionRefsByName.get(record.collectionName);
    if (!varRef || !collRef) continue;

    const modeRef = collRef.modes.find((m) => m.name === record.modeName);
    if (!modeRef) continue;

    const candidates = resolveAliasCandidates(record.rawValue as string, record.collectionName, collectionRefsByName);

    let resolvedTarget: { modeRef: ModeRef; varRef: VariableRef } | undefined;
    for (const candidate of candidates) {
      const targetCollRef = collectionRefsByName.get(candidate.collectionName);
      if (!targetCollRef) continue;
      const targetModeRef = targetCollRef.modes.find((m) => m.name === candidate.modeName);
      if (!targetModeRef) continue;

      const targetPathKey = `${candidate.collectionName} ${candidate.path}`;
      let targetVarRef = variableRefsByPath.get(targetPathKey);
      if (!targetVarRef && targetCollRef.real) {
        const found = await findVariableByName(targetCollRef.real, candidate.path);
        if (found) {
          targetVarRef = { path: candidate.path, collectionName: candidate.collectionName, real: found, isNew: false, resolvedType: found.resolvedType };
        }
      }
      if (targetVarRef) {
        resolvedTarget = { modeRef: targetModeRef, varRef: targetVarRef };
        break;
      }
    }

    const diffEntry = variableDiffByPath.get(pathKey);

    if (!resolvedTarget) {
      summary.warnings.push(
        `Could not resolve alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): value "${record.rawValue}" did not match any known collection/mode/variable.`
      );
      diffEntry?.values.push({ modeName: record.modeName, before: undefined, after: "(unresolved alias)", changed: true });
      continue;
    }

    const beforeRaw = (!varRef.isNew && !modeRef.isNew && varRef.real)
      ? varRef.real.valuesByMode[modeRef.modeId]
      : undefined;
    const before = await formatStoredValue(beforeRaw, varRef.resolvedType);
    const after = `→ ${resolvedTarget.varRef.path}`;
    const changed = !aliasValueEquals(beforeRaw, resolvedTarget.varRef.real?.id);
    diffEntry?.values.push({ modeName: record.modeName, before, after, changed });

    // Already points at the right variable — skip the write.
    if (!changed) continue;

    if (dryRun) {
      summary.aliasesResolved += 1;
      summary.valuesSet += 1;
    } else if (varRef.real && resolvedTarget.varRef.real) {
      try {
        varRef.real.setValueForMode(modeRef.modeId, figma.variables.createVariableAlias(resolvedTarget.varRef.real));
        summary.aliasesResolved += 1;
        summary.valuesSet += 1;
      } catch (err) {
        summary.warnings.push(
          `Failed to set alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Reconcile "update" entries against what actually changed: a matched
  // variable whose description, scopes and every mode's value already equal
  // the file is a true no-op, not an update, whether or not the import
  // touched the document.
  for (const [pathKey, diffEntry] of variableDiffByPath) {
    if (diffEntry.action !== "update") continue;
    const anyValueChanged = diffEntry.values.some((v) => v.changed);
    const metadataChanged = metadataChangedByPath.get(pathKey) ?? false;
    if (!anyValueChanged && !metadataChanged) {
      diffEntry.action = "unchanged";
    } else {
      summary.variablesUpdated += 1;
    }
  }

  // --- Phase 4: prune (SYNC only) — after merging, delete anything anywhere
  // in the document that isn't present in the imported file: whole
  // collections the file never mentions, and leftover variables/modes inside
  // collections it does mention.
  if (importMode === ImportMode.SYNC) {
    for (const collRef of collectionRefsByName.values()) {
      const modeNames = modeNamesByCollection.get(collRef.name);

      if (!modeNames) {
        // Not present in the file at all — delete the whole collection.
        diff.collections.push({ name: collRef.name, action: "delete" });
        summary.collectionsDeleted += 1;
        if (!dryRun && collRef.real) collRef.real.remove();
        continue;
      }

      if (collRef.real) {
        const keptVariableNames = new Set(
          records
            .filter((record) => record.collectionName === collRef.name)
            .map((record) => record.pathParts.join("/"))
        );

        const existingVariables = await Promise.all(
          collRef.real.variableIds.map((id) => figma.variables.getVariableByIdAsync(id))
        );
        for (const variable of existingVariables) {
          if (variable && !keptVariableNames.has(variable.name)) {
            diff.variables.push({ collectionName: collRef.name, path: variable.name, action: "delete", resolvedType: variable.resolvedType, values: [] });
            summary.variablesDeleted += 1;
            if (!dryRun) variable.remove();
          }
        }
      }

      for (const modeRef of collRef.modes) {
        if (modeNames.includes(modeRef.name)) continue;
        diff.modes.push({ collectionName: collRef.name, name: modeRef.name, action: "delete" });
        summary.modesDeleted += 1;
        if (!dryRun && collRef.real && !modeRef.isNew) {
          try {
            collRef.real.removeMode(modeRef.modeId);
          } catch (err) {
            summary.warnings.push(
              `Could not remove mode "${modeRef.name}" from collection "${collRef.name}": ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    }
  }

  return { summary, diff };
}

/**
 * Computes what an import would do — every collection/mode/variable/value
 * create, update or delete — without touching the document. Safe to call
 * freely for preview purposes.
 */
export async function previewImport(rawFiles: string[], importMode: ImportMode): Promise<{ summary: ImportSummary; diff: ImportDiff }> {
  return runImport(rawFiles, importMode, true);
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
  const { summary } = await runImport(rawFiles, importMode, false);
  return summary;
}
