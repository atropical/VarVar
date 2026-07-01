import { rgbToCssColor } from "./color";
import { toCssVar } from "./stringTransformation";
import { isDimensionScope } from "./scopeToDTCG";

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/**
 * Formats a resolved (non-alias) variable value as a CSS custom property value
 * @param value - The raw variable value
 * @param resolvedType - The variable's resolved data type
 * @param scopes - The variable's scopes, used to decide dimension formatting
 */
function formatCssValue(
  value: VariableValue,
  resolvedType: VariableResolvedDataType,
  scopes: VariableScope[]
): string {
  const isColor = resolvedType === "COLOR";
  const isNumber = resolvedType === "FLOAT";
  const isBool = resolvedType === "BOOLEAN";

  return isColor
    ? rgbToCssColor(value as RGBA)
    : isNumber
      ? isDimensionScope(scopes)
        ? `${parseFloat(value as string)}px`
        : `${parseFloat(value as string)}`
      : isBool
        ? Boolean(value) ? 'var(--TRUE)' : 'var(--FALSE)'
        : `"${String(value)}"`;
}

/**
 * Resolves a VARIABLE_ALIAS value into a CSS var() reference
 * @param alias - The variable alias to resolve
 */
async function resolveCssAliasValue(alias: VariableAlias): Promise<string> {
  const linkedVar = await figma.variables.getVariableByIdAsync(alias.id);
  if (!linkedVar) {
    return "initial";
  }
  return `var(--${toCssVar(linkedVar.name)})`;
}

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

  for(const mode of modes) {
    let cssVars: string[] = [];

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name: varName, resolvedType, valuesByMode, scopes, description }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];

        if (value !== undefined && validTypes.has(resolvedType)) {
          const cssVarName = toCssVar(varName, true);
          const cssValue = typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS'
            ? await resolveCssAliasValue(value)
            : formatCssValue(value, resolvedType, scopes);

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
 * Processes an Enterprise extended variable collection into CSS. Only values
 * actually overridden in this collection are emitted; inherited values are
 * left out entirely. Root-mode overrides are merged into the same shared
 * :root block after the parent's declarations, so standard CSS cascade
 * applies them correctly without duplicating the full inherited set.
 * @param extCollection - The extended variable collection to process
 */
async function processExtendedCollection(extCollection: ExtendedVariableCollection): Promise<{ root: string[], theme: string[] }> {
  const { name, modes, variableIds, variableOverrides } = extCollection;
  const collection: string[] = [];
  let rootVars: string[] = [];

  for (const mode of modes) {
    let cssVars: string[] = [];

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name: varName, resolvedType, scopes, description }: Variable = figVar;

        if (validTypes.has(resolvedType)) {
          const overridesForVar = variableOverrides[variableId];
          const overrideValue: VariableValue | undefined = overridesForVar
            ? overridesForVar[mode.modeId]
            : undefined;

          if (overrideValue === undefined) {
            continue;
          }

          const cssVarName = toCssVar(varName, true);
          const cssValue = typeof overrideValue === 'object' && 'type' in overrideValue && overrideValue.type === 'VARIABLE_ALIAS'
            ? await resolveCssAliasValue(overrideValue)
            : formatCssValue(overrideValue, resolvedType, scopes);

          cssVars.push(`  ${cssVarName}: ${cssValue};${description ? `\t/* ${description} */` : ''}`);
        }
      }
    }
    const isRoot = (mode.name === 'Default' || mode.name === 'Mode 1');
    if (isRoot) {
      rootVars.push(...cssVars);
    } else {
      const selector = `.${toCssVar(name)}--${toCssVar(mode.name)}`;
      collection.push(`${selector} {\n${cssVars.join('\n')}\n}`);
    }
    cssVars = [];
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

    const baseCollections = collections.filter((collection) => !collection.isExtension);
    const extendedCollections = collections.filter((collection) => collection.isExtension) as unknown as ExtendedVariableCollection[];

    // Base collections are processed first so any extended-collection
    // overrides are declared later in the merged :root block and win
    // the CSS cascade.
    for(const collection of baseCollections) {
      const { root, theme } = await processCollection(collection);
      root.forEach(v => rootVars.add(v));
      nonRootBlocks.push(...theme);
    }

    for (const extCollection of extendedCollections) {
      const { root, theme } = await processExtendedCollection(extCollection);
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
