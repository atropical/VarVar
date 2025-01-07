import { rgbToCssColor } from "./color";
import { toCamelCase } from "./stringTransformation";

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
        const { name, resolvedType, valuesByMode }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];

        if (value !== undefined && validTypes.has(resolvedType)) {
          let currentObj = variables[toCamelCase(mode.name)];
          const parts = name.split("/").map(toCamelCase);

          parts.forEach((part, i) => {
            if (i === parts.length - 1) {
              currentObj[part] = resolvedType === "COLOR" 
                ? rgbToCssColor(value as RGBA)
                : resolvedType === "FLOAT"
                  ? parseFloat(value as string)
                  : resolvedType === "BOOLEAN"
                    ? Boolean(value)
                    : String(value);
            } else {
              currentObj[part] = currentObj[part] || {};
              currentObj = currentObj[part];
            }
          });
        }
      }
    }
  }

  const varName = toCamelCase(name);
  return `export const ${varName} = ${JSON.stringify(variables, null, 2)
    .replace(/"([^"]+)":/g, '$1:')};\n`;
}

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