import { rgbToCssColor } from "./color";
import { getMatchingModeName } from "./variableUtils";
import { resolveScopedType } from "./scopeToDTCG";

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/**
 * Represents the position and metadata of a variable in CSV format
 */
type VariablePosition = {
    row: number;
    column: string;
    collection: string;
    mode: string;
    var: VariableValue;
    description: string;
}

/**
 * Formats a resolved (non-alias) variable value for a CSV cell
 * @param value - The raw variable value
 * @param resolvedType - The variable's resolved data type
 */
function formatCsvLeafValue(
  value: VariableValue,
  resolvedType: VariableResolvedDataType
): string | boolean | number | RGB {
  const isColor = resolvedType === "COLOR";
  const isNumber = resolvedType === "FLOAT";
  const isBool = resolvedType === "BOOLEAN";

  let formatted: string | boolean | number | RGB = isColor
    ? rgbToCssColor(value as RGBA)
    : isNumber
      ? parseFloat(value as string)
      : isBool
        ? Boolean(value)
        : String(value);

  if (isColor && String(formatted).startsWith('rgb')) {
    formatted = `"${formatted}"`;
  }

  return formatted;
}

/**
 * Resolves a VARIABLE_ALIAS value into a "=Collection/mode/Variable" CSV reference
 * @param alias - The variable alias to resolve
 * @param modeName - The mode name in the referencing collection
 */
async function resolveCsvAliasValue(alias: VariableAlias, modeName: string): Promise<string> {
  const linkedVar = await figma.variables.getVariableByIdAsync(alias.id);
  const linkedVarCollection = linkedVar
    ? await figma.variables.getVariableCollectionByIdAsync(linkedVar.variableCollectionId)
    : { name: '' };

  const matchedModeName = linkedVarCollection && 'modes' in linkedVarCollection
    ? getMatchingModeName(modeName, linkedVarCollection)
    : modeName;

  return linkedVar
    ? `=${linkedVarCollection ? linkedVarCollection.name : ''}/${matchedModeName}/${linkedVar.name}`
    : "_unlinked";
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
  let rowIndex = lastCollectionRowIndex;

  for (const mode of modes) {

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);

      if (figVar !== null) {
        const { id, name:varName, resolvedType, valuesByMode, scopes, description }: Variable = figVar;
        const varValue: VariableValue = valuesByMode[mode.modeId];
        const varDescription = `"${description.replace(/"/g, '""')}"` || '';

        if (varValue !== undefined && validTypes.has(resolvedType)) {
          let value: string | boolean | number | RGB;
          if(collectionsVariablesMap && rowIndex && !collectionsVariablesMap.get(id)) {
            rowIndex++;
            collectionsVariablesMap.set(id, {
                collection: name,
                column: 'E',
                mode: mode.name,
                row: rowIndex,
                var: varValue,
                description: varDescription
              })
          }
          if (typeof varValue === "object" && "id" in varValue) {
            //Linked variable
            if (collectionsVariablesMap && rowIndex) {
              const linkedVar = await figma.variables.getVariableByIdAsync(varValue.id);
              value = linkedVar ? `=${linkedVar.id}` : "_unlinked";
            } else {
              value = await resolveCsvAliasValue(varValue, mode.name);
            }
          }
          else {
            value = formatCsvLeafValue(varValue, resolvedType);
          }
          const scopesStr = `"${scopes.toString()}"`
          const dtcgType = resolveScopedType(scopes, resolvedType);
          csvRows.push(`${name},${mode.name},${varName},${resolvedType},${dtcgType},${value},${scopesStr},false,${varDescription}`);
        }
      }
    }
  }

  return csvRows;
}

/**
 * Processes an Enterprise extended variable collection into CSV rows, preserving
 * the inheritance model: overridden values get their own cell, everything else
 * becomes an "=Collection/mode/Variable" reference into the parent collection.
 * Row/column positioning does not apply to inherited references, since
 * inheritance is a structural relationship, not a VARIABLE_ALIAS link.
 * @param extCollection - The extended variable collection to process
 * @returns Array of CSV row strings
 */
const processExtendedCollectionToCSV = async (
  extCollection: ExtendedVariableCollection
): Promise<string[]> => {
  const { name, modes, variableIds, variableOverrides, parentVariableCollectionId } = extCollection;
  const csvRows: string[] = [];
  const parentCollection = await figma.variables.getVariableCollectionByIdAsync(parentVariableCollectionId);

  for (const mode of modes) {
    const parentMode = parentCollection
      ? parentCollection.modes.find((m) => m.modeId === mode.parentModeId) || parentCollection.modes[0]
      : undefined;

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);

      if (figVar !== null) {
        const { name: varName, resolvedType, scopes, description }: Variable = figVar;

        if (validTypes.has(resolvedType)) {
          const varDescription = `"${description.replace(/"/g, '""')}"` || '';
          const overridesForVar = variableOverrides[variableId];
          const overrideValue: VariableValue | undefined = overridesForVar
            ? overridesForVar[mode.modeId]
            : undefined;
          const isInherited = overrideValue === undefined;

          let value: string | boolean | number | RGB;

          if (isInherited) {
            const parentCollName = parentCollection ? parentCollection.name : name;
            const parentModeName = parentMode ? parentMode.name : mode.name;
            value = `=${parentCollName}/${parentModeName}/${varName}`;
          }
          else if (typeof overrideValue === "object" && "id" in overrideValue) {
            value = await resolveCsvAliasValue(overrideValue, mode.name);
          }
          else {
            value = formatCsvLeafValue(overrideValue, resolvedType);
          }

          const scopesStr = `"${scopes.toString()}"`
          const dtcgType = resolveScopedType(scopes, resolvedType);
          csvRows.push(`${name},${mode.name},${varName},${resolvedType},${dtcgType},${value},${scopesStr},${isInherited},${varDescription}`);
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
  const csvData = ["Collection,Mode,Variable,Type,DTCG Type,Value,Scopes,Inherited,Description"];
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collectionsVariablesMap = new Map<string, VariablePosition>();

  try {
    const baseCollections = collections.filter((collection) => !collection.isExtension);
    const extendedCollections = collections.filter((collection) => collection.isExtension) as unknown as ExtendedVariableCollection[];

    for (const collection of baseCollections) {
      if(useLinkedVarRowAndColPos) {
        csvData.push(...(await processCollectionToCSV(collection, csvData.length, collectionsVariablesMap)));
      }
      else {
        csvData.push(...(await processCollectionToCSV(collection)));
      }
    }
    for (const extCollection of extendedCollections) {
      csvData.push(...(await processExtendedCollectionToCSV(extCollection)));
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
