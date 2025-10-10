import { rgbToCssColor } from "./color";

/**
 * Represents the position and metadata of a variable in CSV format
 */
type VariablePosition = { 
    row: number; 
    column: string; 
    collection: string; 
    mode: string; 
    var: VariableValue;
}

/**
 * Processes a variable collection into CSV rows
 * @param collection - The variable collection to process
 * @param lastCollectionRowIndex - Optional row index for positioning
 * @param collectionsVariablesMap - Optional map for tracking variable positions
 * @returns Array of CSV row strings
 */
const processCollectionToCSV = async (
    { name, modes, variableIds }: VariableCollection, 
    lastCollectionRowIndex?: number, 
    collectionsVariablesMap?: Map<string, VariablePosition>
): Promise<string[]> => {
  const csvRows: string[] = [];
  const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);
  let rowIndex = lastCollectionRowIndex;

  for (const mode of modes) {

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);

      if (figVar !== null) {
        const { id, name:varName, resolvedType, valuesByMode, scopes }: Variable = figVar;
        const varValue: VariableValue = valuesByMode[mode.modeId];

        const isColor: boolean = resolvedType === "COLOR";
        const isNumber: boolean = resolvedType === "FLOAT";
        const isBool: boolean = resolvedType === "BOOLEAN";

        if (varValue !== undefined && validTypes.has(resolvedType)) {
          let value: string | boolean | number | RGB;
          if(collectionsVariablesMap && rowIndex && !collectionsVariablesMap.get(id)) {
            rowIndex++;
            collectionsVariablesMap.set(id, {
                collection: name,
                column: 'E',
                mode: mode.name,
                row: rowIndex,
                var: varValue
              })
          }
          if (typeof varValue === "object" && "id" in varValue) {
            //Linked variable
            const linkedVar = await figma.variables.getVariableByIdAsync(varValue.id);
            const linkedVarCollection = linkedVar
              ? await figma.variables.getVariableCollectionByIdAsync(linkedVar.variableCollectionId)
              : {name:''};
            
            value = linkedVar ? 
            collectionsVariablesMap && rowIndex 
            ? `=${linkedVar.id}`
            : `=${linkedVarCollection ? linkedVarCollection.name : ''}/${mode.name}/${linkedVar.name}` : "_unlinked";
          }
          else {
            value = isColor
              ? rgbToCssColor(varValue as RGBA)
              : isNumber
                ? parseFloat(varValue as string)
                  : isBool
                    ? Boolean(varValue)
                    : String(varValue);

            if (isColor && String(value).startsWith('rgb')) {
              value = `"${value}"`
            };
          }
          const scopesStr = `"${scopes.toString()}"`
          csvRows.push(`${name},${mode.name},${varName},${resolvedType},${value},${scopesStr}`);
        }
      }
    }
  }

  return csvRows;
}

/**
 * Exports all local variable collections to CSV format
 * @param useLinkedVarRowAndColPos - Whether to use row/column positioning for linked variables
 * @returns CSV string with all variables
 */
export const exportToCSV = async (useLinkedVarRowAndColPos: boolean = false): Promise<string | undefined> => {
  const csvData = ["Collection,Mode,Variable,Type,Value,Scopes"];
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collectionsVariablesMap = new Map<string, VariablePosition>();

  try {
    for (const collection of collections) {
      if(useLinkedVarRowAndColPos) {
        csvData.push(...(await processCollectionToCSV(collection, csvData.length, collectionsVariablesMap)));
      }
      else {
        csvData.push(...(await processCollectionToCSV(collection)));
      }
    }
    if(useLinkedVarRowAndColPos) {
      // Replace the linked vars (starting with `=`) with the map and its row/column references
      const linkedVarRegEx = /=([^,]*)/;
      for (let i = 0, leng = csvData.length; i < leng; i++) {
        const row: string = csvData[i];
        const linkedVarMatch = linkedVarRegEx.exec(row);
        const linkedVarKey = linkedVarMatch && linkedVarMatch[1] ? linkedVarMatch[1] : undefined;
        if (linkedVarKey) {
          const linkedVar = collectionsVariablesMap.get(linkedVarKey);

          if (linkedVar) {
            csvData[i] = row.replace(linkedVarRegEx, `=${linkedVar.column}${linkedVar.row}`)
          }
        }
      }
    }
    return csvData.join("\n");  
  }
  catch (err) {
    console.error(err);
  }
};
