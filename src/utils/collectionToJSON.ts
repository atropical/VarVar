import { rgbToCssColor } from "./color";
import { getMatchingModeName } from "./variableUtils";
import { resolveScopedType, isDimensionScope } from "./scopeToDTCG";
import { toFileSlug } from "./stringTransformation";
import type { ExportFile } from "../types.d";

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/**
 * Formats a resolved (non-alias) variable value for JSON output
 * @param value - The raw variable value
 * @param resolvedType - The variable's resolved data type
 * @param scopes - The variable's scopes, used to decide dimension formatting
 * @returns The formatted $value
 */
function formatLeafValue(
  value: VariableValue,
  resolvedType: VariableResolvedDataType,
  scopes: VariableScope[]
): string | number | boolean {
  const isColor = resolvedType === "COLOR";
  const isNumber = resolvedType === "FLOAT";
  const isBool = resolvedType === "BOOLEAN";
  const isDimension = isNumber && isDimensionScope(scopes);

  return isColor
    ? rgbToCssColor(value as RGBA)
    : isNumber
      ? isDimension
        ? `${parseFloat(value as string)}px`
        : parseFloat(value as string)
      : isBool
        ? Boolean(value)
        : String(value);
}

/**
 * Resolves a VARIABLE_ALIAS value into a "$.Collection.mode.path" reference string
 * @param alias - The variable alias to resolve
 * @param modeName - The mode name in the referencing collection
 * @param currentCollectionName - The name of the collection containing the alias
 * @returns The resolved alias path, or "_unlinked" if the target no longer exists
 */
async function resolveAliasValue(
  alias: VariableAlias,
  modeName: string,
  currentCollectionName: string
): Promise<string> {
  const linkedVar = await figma.variables.getVariableByIdAsync(alias.id);
  if (!linkedVar) {
    return "_unlinked";
  }

  const linkedVarCollection = await figma.variables.getVariableCollectionByIdAsync(linkedVar.variableCollectionId);
  let collName = '$.';

  if (linkedVarCollection && currentCollectionName !== linkedVarCollection.name) {
    collName = `$.${linkedVarCollection.name}`;
  }
  const matchedModeName = linkedVarCollection
    ? getMatchingModeName(modeName, linkedVarCollection)
    : modeName;

  return `${collName}.${matchedModeName}.${linkedVar.name.replace(/\//g, ".")}`;
}

/**
 * Processes a variable collection into JSON format
 * @param collection - The variable collection to process
 * @returns Array of JSON objects representing the collection
 */
async function processCollection({
    name,
    modes,
    variableIds,
}: VariableCollection): Promise<[]> {
  const collection: [] = [];

  for(const mode of modes) {
    const file = { collection: name, mode: mode.name, variables: {} };

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name, resolvedType, valuesByMode, scopes, description }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];

        if (value !== undefined && validTypes.has(resolvedType)) {
          let obj: any = file.variables;

          name.split("/").forEach((groupName) => {
            obj[groupName] = obj[groupName] || {};
            obj = obj[groupName];
          });
          obj.$type = resolveScopedType(scopes, resolvedType);
          obj.$description = description || '';
          obj.$extensions = { figma: { scopes, resolvedType } };

          if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
            obj.$value = await resolveAliasValue(value, mode.name, name);
          }
          else {
            obj.$value = formatLeafValue(value, resolvedType, scopes);
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
 * @returns Array of JSON objects representing the extended collection
 */
async function processExtendedCollection(extCollection: ExtendedVariableCollection): Promise<[]> {
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
        const { name: varName, resolvedType, scopes, description }: Variable = figVar;

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
          obj.$type = resolveScopedType(scopes, resolvedType);
          obj.$description = description || '';
          obj.$extensions = { figma: { scopes, resolvedType, inherited: isInherited } };

          if (isInherited) {
            const parentCollName = parentCollection ? parentCollection.name : name;
            const parentModeName = parentMode ? parentMode.name : mode.name;
            obj.$value = `$.${parentCollName}.${parentModeName}.${varName.replace(/\//g, ".")}`;
          }
          else if (typeof overrideValue === 'object' && 'type' in overrideValue && overrideValue.type === 'VARIABLE_ALIAS') {
            obj.$value = await resolveAliasValue(overrideValue, mode.name, name);
          }
          else {
            obj.$value = formatLeafValue(overrideValue, resolvedType, scopes);
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
 * @returns Array of exported files
 */
export const exportToJSON = async (): Promise<ExportFile[] | undefined> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  try {
    const hasExtendedCollections = collections.some((collection) => collection.isExtension);

    if (!hasExtendedCollections) {
      const files: any[] = [];
      for (const collection of collections) {
        files.push(...(await processCollection(collection)));
      }
      return [{ filename: "variables", content: JSON.stringify(files, null, 2) }];
    }

    const baseCollections = collections.filter((collection) => !collection.isExtension);
    const extendedCollections = collections.filter((collection) => collection.isExtension) as unknown as ExtendedVariableCollection[];

    const baseFiles: any[] = [];
    for (const collection of baseCollections) {
      baseFiles.push(...(await processCollection(collection)));
    }

    const result: ExportFile[] = [
      { filename: "base.tokens", content: JSON.stringify(baseFiles, null, 2) },
    ];

    for (const extCollection of extendedCollections) {
      const processed = await processExtendedCollection(extCollection);
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
