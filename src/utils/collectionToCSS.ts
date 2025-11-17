import { rgbToCssColor } from "./color";
import { toCssVar } from "./stringTransformation";

/**
 * Processes a variable collection into CSS format
 * @param collection - The variable collection to process
 * @returns Object containing root variables and theme-specific CSS blocks
 */
async function processCollection({
    name,
    modes,
    variableIds,
}: VariableCollection): Promise<{ root: string[], theme: string[] }> {
  const collection: string[] = [];
  let rootVars: string[] = [];
  const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

  for(const mode of modes) {
    let cssVars: string[] = [];

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name, resolvedType, valuesByMode, description }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];

        if (value !== undefined && validTypes.has(resolvedType)) {
          const cssVarName = toCssVar(name, true);
          let cssValue: string;
  
          const isColor: boolean = resolvedType === "COLOR";
          const isNumber: boolean = resolvedType === "FLOAT";
          const isBool: boolean = resolvedType === "BOOLEAN";

          if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
            const linkedVar = await figma.variables.getVariableByIdAsync(value.id);

            if(linkedVar) {
              const linkedName = toCssVar(linkedVar.name);
              cssValue = `var(--${linkedName})`;
            }
            else {
              cssValue = "initial";
            }
          }
          else {
            cssValue = isColor 
              ? rgbToCssColor(value as RGBA)
              : isNumber
                ? `${parseFloat(value as string)}px`
                  : isBool
                    ? Boolean(value) ? 'var(--TRUE)' : 'var(--FALSE)'
                    : `"${String(value)}"`;
          }
          cssVars.push(`  ${cssVarName}: ${cssValue};${description ? `\t/* ${description} */` : ''}`);
        }
      } 
    }
    const isRoot =  (mode.name === 'Default' || mode.name === 'Mode 1');
    let selector;
    if(isRoot) {
      rootVars.push(... cssVars);
    }
    else {
      selector = `.${toCssVar(name)}--${toCssVar(mode.name)}`;
      collection.push(`${selector} {\n${cssVars.join('\n')}\n}`);
    }
    cssVars= [];
  }
  return { root: rootVars, theme: collection };
}

/**
 * Exports all local variable collections to CSS format
 * @returns CSS string with custom properties and theme selectors
 */
export const exportToCSS = async (): Promise<string> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  try {
    const rootVars = new Set<string>();  // Use Set to avoid duplicates
    const nonRootBlocks: string[] = [];
    
    for(const collection of collections) {
      const { root, theme } = await processCollection(collection);
      root.forEach(v => rootVars.add(v));
      nonRootBlocks.push(...theme);
    }

    // Create single root selector with all variables including TRUE/FALSE
    const rootBlock = `:root {\n  --TRUE: 1;\n  --FALSE: 0;\n${Array.from(rootVars).join('\n')}\n}`;

    return [rootBlock, ...nonRootBlocks].join('\n\n');
  } catch (err) {
    console.error(err);
    return `/* Something went wrong while converting:
            ${err}*/`;
  }
};