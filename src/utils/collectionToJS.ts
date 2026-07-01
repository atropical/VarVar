import { rgbToCssColor } from "./color";
import { toCamelCase } from "./stringTransformation";
import { getMatchingModeName } from "./variableUtils";
import { resolveScopedType } from "./scopeToDTCG";

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/**
 * Builds a JS property-path reference (e.g. "brand.mode.color.primary.value")
 * to another variable, prefixed with its collection when it differs from the
 * referencing collection
 * @param targetVarName - The slash-separated name of the referenced variable
 * @param targetModeName - The mode name to reference in the target collection
 * @param targetCollectionName - The name of the collection the variable lives in
 * @param currentCollectionName - The name of the collection containing the reference
 */
function buildJsAliasPath(
  targetVarName: string,
  targetModeName: string,
  targetCollectionName: string,
  currentCollectionName: string
): string {
  const collPrefix = targetCollectionName !== currentCollectionName
    ? `${toCamelCase(targetCollectionName)}.`
    : '';
  return `${collPrefix}${toCamelCase(targetModeName)}.${targetVarName.split('/').map((str) => toCamelCase(str)).join('.')}.value`;
}

/**
 * Serializes a collection's nested variables object into an `export const ...` statement
 * @param collectionName - The collection name, used to derive the export identifier
 * @param variables - The nested variables object, keyed by camelCased mode/group/name
 */
function serializeVariablesAsJs(collectionName: string, variables: Record<string, any>): string {
  const varName = toCamelCase(collectionName);
  return `export const ${varName} = ${JSON.stringify(variables, null, 2)
    // First handle numeric-only keys
    .replace(/^(\s*)"(\d+)":/gm, '$1"$2":')
    // Then handle property keys
    .replace(/"([^"]+)":/g, (match, key) => {
        return /^\d+$/.test(key) ? match : `${key}:`
    })
    // Handle linked variable references in value field
    .replace(/"value":\s*"([$_a-zA-Z][$_a-zA-Z0-9]*(?:\.[$_a-zA-Z][$_a-zA-Z0-9]*)*(?:\.\d+)*(?:\.[$_a-zA-Z][$_a-zA-Z0-9]*)*)"/g, (match, p1) => {
        return `value: ${p1.replace(/\.(\d+)(?=\.|$)/g, '["$1"]')}`;
    })};\n`;
}

/**
 * Processes a variable collection into JavaScript format
 * @param collection - The variable collection to process
 * @returns JavaScript export string for the collection
 */
async function processCollection({
    name,
    modes,
    variableIds,
}: VariableCollection): Promise<string> {
  const variables: Record<string, any> = {};

  for (const mode of modes) {
    variables[toCamelCase(mode.name)] = {};

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name, resolvedType, valuesByMode, scopes, description }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];
        const dtcgType = resolveScopedType(scopes, resolvedType);

        if (value !== undefined && validTypes.has(resolvedType)) {
          let currentObj = variables[toCamelCase(mode.name)];
          const parts = name.split("/").map((str) => toCamelCase(str));

          for (let i = 0, partsLength=parts.length; i < partsLength; i++) {
            const part = parts[i];

            if (i === partsLength - 1) {
              if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
                const linkedVar = await figma.variables.getVariableByIdAsync(value.id);

                if (linkedVar) {
                  const linkedVarCollection = await figma.variables.getVariableCollectionByIdAsync(linkedVar.variableCollectionId);
                  const matchedModeName = linkedVarCollection
                    ? getMatchingModeName(mode.name, linkedVarCollection)
                    : mode.name;
                  const aliasValue = buildJsAliasPath(
                    linkedVar.name,
                    matchedModeName,
                    linkedVarCollection ? linkedVarCollection.name : name,
                    name
                  );
                  currentObj[part] = description
                    ? { value: aliasValue, description, dtcgType }
                    : { value: aliasValue, dtcgType };
                } else {
                  currentObj[part] = '_unlinked';
                }
              } else {
                const processedValue = resolvedType === "COLOR"
                  ? rgbToCssColor(value as RGBA)
                  : resolvedType === "FLOAT"
                    ? parseFloat(value as string)
                    : resolvedType === "BOOLEAN"
                      ? Boolean(value)
                      : String(value);

                currentObj[part] = description
                  ? { value: processedValue, description, dtcgType }
                  : { value: processedValue, dtcgType };
              }
            }
            else {
              currentObj[part] = currentObj[part] || {};
              currentObj = currentObj[part];
            }
          }
        }
      }
    }
  }

  return serializeVariablesAsJs(name, variables);
}

/**
 * Processes an Enterprise extended variable collection into JavaScript format,
 * preserving the inheritance model: overridden values keep their own value,
 * everything else becomes a property-path reference into the parent
 * collection's export.
 * @param extCollection - The extended variable collection to process
 * @returns JavaScript export string for the extended collection
 */
async function processExtendedCollection(extCollection: ExtendedVariableCollection): Promise<string> {
  const { name, modes, variableIds, variableOverrides, parentVariableCollectionId } = extCollection;
  const variables: Record<string, any> = {};
  const parentCollection = await figma.variables.getVariableCollectionByIdAsync(parentVariableCollectionId);

  for (const mode of modes) {
    variables[toCamelCase(mode.name)] = {};
    const parentMode = parentCollection
      ? parentCollection.modes.find((m) => m.modeId === mode.parentModeId) || parentCollection.modes[0]
      : undefined;

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name: varName, resolvedType, scopes, description }: Variable = figVar;

        if (validTypes.has(resolvedType)) {
          const dtcgType = resolveScopedType(scopes, resolvedType);
          const overridesForVar = variableOverrides[variableId];
          const overrideValue: VariableValue | undefined = overridesForVar
            ? overridesForVar[mode.modeId]
            : undefined;
          const isInherited = overrideValue === undefined;

          let currentObj = variables[toCamelCase(mode.name)];
          const parts = varName.split("/").map((str) => toCamelCase(str));

          for (let i = 0, partsLength = parts.length; i < partsLength; i++) {
            const part = parts[i];

            if (i === partsLength - 1) {
              if (isInherited) {
                const parentModeName = parentMode ? parentMode.name : mode.name;
                const parentCollName = parentCollection ? parentCollection.name : name;
                const aliasValue = buildJsAliasPath(varName, parentModeName, parentCollName, name);
                currentObj[part] = description
                  ? { value: aliasValue, description, dtcgType, inherited: true }
                  : { value: aliasValue, dtcgType, inherited: true };
              }
              else if (typeof overrideValue === 'object' && 'type' in overrideValue && overrideValue.type === 'VARIABLE_ALIAS') {
                const linkedVar = await figma.variables.getVariableByIdAsync(overrideValue.id);

                if (linkedVar) {
                  const linkedVarCollection = await figma.variables.getVariableCollectionByIdAsync(linkedVar.variableCollectionId);
                  const matchedModeName = linkedVarCollection
                    ? getMatchingModeName(mode.name, linkedVarCollection)
                    : mode.name;
                  const aliasValue = buildJsAliasPath(
                    linkedVar.name,
                    matchedModeName,
                    linkedVarCollection ? linkedVarCollection.name : name,
                    name
                  );
                  currentObj[part] = description
                    ? { value: aliasValue, description, dtcgType, inherited: false }
                    : { value: aliasValue, dtcgType, inherited: false };
                } else {
                  currentObj[part] = '_unlinked';
                }
              }
              else {
                const processedValue = resolvedType === "COLOR"
                  ? rgbToCssColor(overrideValue as RGBA)
                  : resolvedType === "FLOAT"
                    ? parseFloat(overrideValue as string)
                    : resolvedType === "BOOLEAN"
                      ? Boolean(overrideValue)
                      : String(overrideValue);

                currentObj[part] = description
                  ? { value: processedValue, description, dtcgType, inherited: false }
                  : { value: processedValue, dtcgType, inherited: false };
              }
            }
            else {
              currentObj[part] = currentObj[part] || {};
              currentObj = currentObj[part];
            }
          }
        }
      }
    }
  }

  return serializeVariablesAsJs(name, variables);
}

/**
 * Exports all local variable collections to JavaScript format
 * @returns JavaScript string with exported variable objects
 */
export const exportToJS = async (): Promise<string | undefined> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  try {
    const exports: string[] = [];

    const baseCollections = collections.filter((collection) => !collection.isExtension);
    const extendedCollections = collections.filter((collection) => collection.isExtension) as unknown as ExtendedVariableCollection[];

    for (const collection of baseCollections) {
      exports.push(await processCollection(collection));
    }
    for (const extCollection of extendedCollections) {
      exports.push(await processExtendedCollection(extCollection));
    }

    return exports.join('\n');
  } catch (err) {
    console.error(err);
  }
};
