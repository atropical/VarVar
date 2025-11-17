import { rgbToCssColor } from "./color";
import { toCamelCase } from "./stringTransformation";

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
  const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);
  const variables: Record<string, any> = {};

  for (const mode of modes) {
    variables[toCamelCase(mode.name)] = {};

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name, resolvedType, valuesByMode, description }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];

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
                  const collPrefix = linkedVarCollection && linkedVarCollection.name !== name ?
                    `${toCamelCase(linkedVarCollection.name)}.` : '';

                    const aliasValue = `${collPrefix}${toCamelCase(mode.name)}.${linkedVar.name.split('/').map((str) => toCamelCase(str)).join('.')}.value`;
                    currentObj[part] = description 
                      ? { value: aliasValue, description }
                      : { value: aliasValue };
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
                  ? { value: processedValue, description }
                  : { value: processedValue };
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

  const varName = toCamelCase(name);
  const output = `export const ${varName} = ${JSON.stringify(variables, null, 2)
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

    return output;
}

/**
 * Exports all local variable collections to JavaScript format
 * @returns JavaScript string with exported variable objects
 */
export const exportToJS = async (): Promise<string | undefined> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  try {
    const exports: string[] = [];
    for (const collection of collections) {
      const processedCollection = await processCollection(collection);
      exports.push(processedCollection);
    }
    return exports.join('\n');
  } catch (err) {
    console.error(err);
  }
};