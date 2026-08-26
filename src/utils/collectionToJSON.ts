import { rgbToCssColor, toDtcgColorValue } from "./color";
import { cleanFloat32 } from "./numberFormat";
import { getMatchingModeName, normalizeCodeSyntax } from "./variableUtils";
import { resolveEmittedType, shouldUnitizeNumericValue } from "./scopeToDTCG";
import { DEFAULT_UNIT_OPTIONS, formatDtcgNumericValue, toUnitOptions } from "./units";
import type { DtcgDimensionValue, UnitOptions } from "./units";
import type { DtcgColorValue } from "./colorSpaces";
import { toFileSlug } from "./stringTransformation";
import type { ExportFile, ExportUnit } from "../types.d";

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/**
 * How a JSON export shapes its values: the unit dimension-scoped numbers get,
 * whether default-scoped numbers count as dimensions too, and whether values
 * that DTCG spells as objects — a dimension's `{value, unit}`, a colour's
 * `{colorSpace, components}` — are written that way or in the older string
 * spellings (`"16px"`, `"#ff00ff"`) earlier versions emitted.
 */
export interface JsonValueOptions {
  unitOptions: UnitOptions;
  appendPxToUnscoped: boolean;
  dtcgCompliantValues: boolean;
}

/**
 * Whether a FLOAT value with these scopes is actually emitted with a unit — the
 * one question both the `$value` shape and the `$type` beside it depend on. A
 * unit of "none" means nothing is unitised, whatever the scopes say.
 * @param resolvedType - The variable's resolved data type
 * @param scopes - The variable's scopes
 * @param options - The export's value-shaping options
 */
function isUnitizedValue(
  resolvedType: VariableResolvedDataType,
  scopes: VariableScope[],
  options: JsonValueOptions
): boolean {
  return resolvedType === "FLOAT"
    && options.unitOptions.unit !== "none"
    && shouldUnitizeNumericValue(scopes, options.appendPxToUnscoped);
}

/**
 * Formats a resolved (non-alias) variable value for JSON output
 * @param value - The raw variable value
 * @param resolvedType - The variable's resolved data type
 * @param scopes - The variable's scopes, used to decide dimension formatting
 * @param options - The export's value-shaping options
 * @returns The formatted $value
 */
function formatLeafValue(
  value: VariableValue,
  resolvedType: VariableResolvedDataType,
  scopes: VariableScope[],
  options: JsonValueOptions
): string | number | boolean | DtcgDimensionValue | DtcgColorValue {
  const isColor = resolvedType === "COLOR";
  const isNumber = resolvedType === "FLOAT";
  const isBool = resolvedType === "BOOLEAN";

  return isColor
    ? options.dtcgCompliantValues
      ? toDtcgColorValue(value as RGBA)
      : rgbToCssColor(value as RGBA)
    : isNumber
      ? isUnitizedValue(resolvedType, scopes, options)
        ? formatDtcgNumericValue(Number(value), options.unitOptions, options.dtcgCompliantValues)
        : cleanFloat32(Number(value))
      : isBool
        ? Boolean(value)
        : String(value);
}

/**
 * Resolves a VARIABLE_ALIAS value into a "$.Collection.mode.path" reference string
 *
 * The target variable's "/" group separators are flattened to ".", which is
 * lossy: a name segment containing a literal "." becomes indistinguishable
 * from a group boundary. Import compensates by trying every reading of the
 * flattened tail against the collection's real variables (see
 * `pathVariants` / `resolveAliasCandidates` in importJSON.ts) rather than by
 * escaping here, so the emitted format stays byte-compatible with every
 * version of the exporter.
 *
 * The target collection is always named in full, including when it is the same
 * collection the alias lives in. A same-collection short form ("$..Mode.path")
 * would be shorter but not self-describing: mode names like Figma's default
 * "Mode 1" recur across collections, so a reference that omits the collection
 * can only be read by tracking the enclosing file entry. Import understands
 * both forms, but every released exporter has emitted the qualified one, so
 * that is what downstream consumers are handed.
 *
 * @param alias - The variable alias to resolve
 * @param modeName - The mode name in the referencing collection
 * @returns The resolved alias path, or "_unlinked" if the target no longer exists
 */
async function resolveAliasValue(
  alias: VariableAlias,
  modeName: string
): Promise<string> {
  const linkedVar = await figma.variables.getVariableByIdAsync(alias.id);
  if (!linkedVar) {
    return "_unlinked";
  }

  const linkedVarCollection = await figma.variables.getVariableCollectionByIdAsync(linkedVar.variableCollectionId);
  const collName = linkedVarCollection ? `$.${linkedVarCollection.name}` : '$.';
  const matchedModeName = linkedVarCollection
    ? getMatchingModeName(modeName, linkedVarCollection)
    : modeName;

  return `${collName}.${matchedModeName}.${linkedVar.name.replace(/\//g, ".")}`;
}

/**
 * Processes a variable collection into JSON format
 * @param collection - The variable collection to process
 * @param options - The export's value-shaping options
 * @returns Array of JSON objects representing the collection
 */
async function processCollection({
    name,
    modes,
    variableIds,
}: VariableCollection, options: JsonValueOptions): Promise<[]> {
  const collection: [] = [];

  for(const mode of modes) {
    const file = { collection: name, mode: mode.name, variables: {} };

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name: varName, resolvedType, valuesByMode, scopes, description, codeSyntax }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];
        const usedCodeSyntax = normalizeCodeSyntax(codeSyntax);

        if (value !== undefined && validTypes.has(resolvedType)) {
          let obj: any = file.variables;

          varName.split("/").forEach((groupName) => {
            obj[groupName] = obj[groupName] || {};
            obj = obj[groupName];
          });
          obj.$type = resolveEmittedType(scopes, resolvedType, isUnitizedValue(resolvedType, scopes, options), value);
          obj.$description = description || '';
          obj.$extensions = { figma: { scopes, resolvedType, ...(usedCodeSyntax ? { codeSyntax: usedCodeSyntax } : {}) } };

          if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
            obj.$value = await resolveAliasValue(value, mode.name);
          }
          else {
            obj.$value = formatLeafValue(value, resolvedType, scopes, options);
          }
        }
      }
    }
    collection.push(file as never);
  };
  return collection;
}

/**
 * Processes an Enterprise extended variable collection into JSON format, preserving
 * the inheritance model: overridden values get their own $value, everything else
 * becomes an alias reference into the parent collection's tokens.
 * @param extCollection - The extended variable collection to process
 * @param options - The export's value-shaping options
 * @returns Array of JSON objects representing the extended collection
 */
async function processExtendedCollection(extCollection: ExtendedVariableCollection, options: JsonValueOptions): Promise<[]> {
  const { name, modes, variableIds, variableOverrides, parentVariableCollectionId } = extCollection;
  const collection: [] = [];
  const parentCollection = await figma.variables.getVariableCollectionByIdAsync(parentVariableCollectionId);

  for (const mode of modes) {
    const file = { collection: name, mode: mode.name, variables: {} };
    const parentMode = parentCollection
      ? parentCollection.modes.find((m) => m.modeId === mode.parentModeId) || parentCollection.modes[0]
      : undefined;

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name: varName, resolvedType, scopes, description, codeSyntax }: Variable = figVar;
        const usedCodeSyntax = normalizeCodeSyntax(codeSyntax);

        if (validTypes.has(resolvedType)) {
          const overridesForVar = variableOverrides[variableId];
          const overrideValue: VariableValue | undefined = overridesForVar
            ? overridesForVar[mode.modeId]
            : undefined;
          const isInherited = overrideValue === undefined;

          let obj: any = file.variables;
          varName.split("/").forEach((groupName) => {
            obj[groupName] = obj[groupName] || {};
            obj = obj[groupName];
          });
          obj.$type = resolveEmittedType(scopes, resolvedType, isUnitizedValue(resolvedType, scopes, options), overrideValue);
          obj.$description = description || '';
          obj.$extensions = { figma: { scopes, resolvedType, inherited: isInherited, ...(usedCodeSyntax ? { codeSyntax: usedCodeSyntax } : {}) } };

          if (isInherited) {
            const parentCollName = parentCollection ? parentCollection.name : name;
            const parentModeName = parentMode ? parentMode.name : mode.name;
            obj.$value = `$.${parentCollName}.${parentModeName}.${varName.replace(/\//g, ".")}`;
          }
          else if (typeof overrideValue === 'object' && 'type' in overrideValue && overrideValue.type === 'VARIABLE_ALIAS') {
            obj.$value = await resolveAliasValue(overrideValue, mode.name);
          }
          else {
            obj.$value = formatLeafValue(overrideValue, resolvedType, scopes, options);
          }
        }
      }
    }
    collection.push(file as never);
  }
  return collection;
}

/**
 * Exports all local variable collections to JSON format.
 *
 * When no extended (Enterprise) collections are present, this returns a single
 * file identical to the plugin's historic combined-document output. When
 * extended collections are present, base collections are combined into one
 * "base.tokens" file and each extended collection is exported as its own file,
 * so the inheritance hierarchy is preserved instead of flattened.
 * @param exportUnit - The unit numeric dimension values are emitted with (`px`,
 *        `rem`, or "none" for a bare number). These are exactly the units DTCG
 *        defines for a `dimension`.
 * @param rootFontSize - What a `rem` conversion divides by
 * @param appendPxToUnscoped - Also give the unit to values whose scoping is undecided
 *        (no scopes, or ALL_SCOPES). Off by default.
 * @param dtcgCompliantValues - Emit the spec's object shapes rather than the string
 *        forms earlier versions emitted: `{ "value": 16, "unit": "px" }` for a
 *        dimension, and `{ "colorSpace": "srgb", "components": [...] }` for a colour.
 *        On by default; turning it off is an escape hatch for existing consumers.
 * @returns Array of exported files
 */
export const exportToJSON = async (exportUnit: ExportUnit = DEFAULT_UNIT_OPTIONS.unit, rootFontSize: number = DEFAULT_UNIT_OPTIONS.rootFontSize, appendPxToUnscoped: boolean = false, dtcgCompliantValues: boolean = true): Promise<ExportFile[] | undefined> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const valueOptions: JsonValueOptions = {
    unitOptions: toUnitOptions(exportUnit, rootFontSize),
    appendPxToUnscoped,
    dtcgCompliantValues,
  };
  try {
    const hasExtendedCollections = collections.some((collection) => collection.isExtension);

    if (!hasExtendedCollections) {
      const files: any[] = [];
      for (const collection of collections) {
        files.push(...(await processCollection(collection, valueOptions)));
      }
      return [{ filename: "variables", content: JSON.stringify(files, null, 2) }];
    }

    const baseCollections = collections.filter((collection) => !collection.isExtension);
    const extendedCollections = collections.filter((collection) => collection.isExtension) as unknown as ExtendedVariableCollection[];

    const baseFiles: any[] = [];
    for (const collection of baseCollections) {
      baseFiles.push(...(await processCollection(collection, valueOptions)));
    }

    const result: ExportFile[] = [
      { filename: "base.tokens", content: JSON.stringify(baseFiles, null, 2) },
    ];

    for (const extCollection of extendedCollections) {
      const processed = await processExtendedCollection(extCollection, valueOptions);
      result.push({
        filename: `${toFileSlug(extCollection.name)}.tokens`,
        content: JSON.stringify(processed, null, 2),
      });
    }

    return result;
  }
  catch (err) {
    console.error(err);
  }
};
