import { rgbToCssColor } from "./color";

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
  const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

  for(const mode of modes) {
    const file = { collection: name, mode: mode.name, variables: {} };

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name, resolvedType, valuesByMode, scopes }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];

        if (value !== undefined && validTypes.has(resolvedType)) {
          let obj: any = file.variables;
  
          name.split("/").forEach((groupName) => {
            obj[groupName] = obj[groupName] || {};
            obj = obj[groupName];
          });
          const isColor: boolean = resolvedType === "COLOR";
          const isNumber: boolean = resolvedType === "FLOAT";
          const isBool: boolean = resolvedType === "BOOLEAN";
          obj.$type = resolvedType;
          obj.$scopes = scopes;
          if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
            const linkedVar = await figma.variables.getVariableByIdAsync(value.id);

            if(linkedVar) {
              const linkedVarCollection = await figma.variables.getVariableCollectionByIdAsync(linkedVar.variableCollectionId);
              let collName = '$.';

              if(linkedVarCollection && name !== linkedVarCollection.name) {
                collName = `$.${linkedVarCollection.name}`
              }
              obj.$value = `${collName}.${mode.name}.${linkedVar.name.replace(/\//g, ".")}`;
            }
            else {
              obj.$value = "_unlinked"
            }
          }
          else {
            obj.$value = isColor 
              ? rgbToCssColor(value as RGBA)
              : isNumber
                ? parseFloat(value as string)
                  : isBool
                    ? Boolean(value)
                    : String(value);
          }
        }
      }
    }
    collection.push(file as never);
  };
  return collection;
}

/**
 * Exports all local variable collections to JSON format
 * @returns JSON string with structured variable data
 */
export const exportToJSON = async (): Promise<string | undefined> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  try {
    const files: any[] = [];
    for( const collection of collections ) {
      const processedCollection = await processCollection(collection);
      files.push(... processedCollection );
    }
    const jsonData = JSON.stringify(files, null, 2);
    return jsonData;
  }
  catch (err) {
    console.error(err);
  }
};
