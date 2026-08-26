import { rgbToCssColor } from "./color";
import {
  toCssVar,
  toCodeSyntaxCssVar,
  DEFAULT_GROUP_SEPARATOR,
  SINGLE_GROUP_SEPARATOR,
  recordEmittedVarName,
  recordRejectedCodeSyntax,
  buildCollisionComment,
  buildCodeSyntaxComment
} from "./stringTransformation";
import type { NameOptions } from "./stringTransformation";
import { isDimensionScope, isUnscoped } from "./scopeToDTCG";

/**
 * Resolves the `--`-prefixed CSS custom property name a variable is emitted as.
 * With the code-syntax option on, a usable `codeSyntax.WEB` wins over the name
 * derived from the Figma variable name; anything that couldn't be a custom
 * property name is recorded and falls back to the derived name.
 * @param figVar - The Figma variable being named
 * @param groupSeparator - What Figma's `/` group delimiter becomes in the name
 * @param nameOptions - Per-run code-syntax option and rejection registry
 */
function resolveCssVarName(figVar: Variable, groupSeparator: string, nameOptions: NameOptions): string {
  if (nameOptions.useCodeSyntaxName) {
    const override = figVar.codeSyntax?.WEB;
    const fromCodeSyntax = toCodeSyntaxCssVar(override);
    if (fromCodeSyntax) {
      return fromCodeSyntax;
    }
    if (typeof override === "string" && override.trim() !== "") {
      recordRejectedCodeSyntax(nameOptions.rejectedCodeSyntax, figVar.name, override);
    }
  }
  return toCssVar(figVar.name, true, groupSeparator);
}

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/**
 * Formats a resolved (non-alias) variable value as a CSS custom property value
 * @param value - The raw variable value
 * @param resolvedType - The variable's resolved data type
 * @param scopes - The variable's scopes, used to decide dimension formatting
 * @param appendPxToUnscoped - Also emit `px` for numbers whose scoping is undecided
 */
function formatCssValue(
  value: VariableValue,
  resolvedType: VariableResolvedDataType,
  scopes: VariableScope[],
  appendPxToUnscoped: boolean
): string {
  const isColor = resolvedType === "COLOR";
  const isNumber = resolvedType === "FLOAT";
  const isBool = resolvedType === "BOOLEAN";

  return isColor
    ? rgbToCssColor(value as RGBA)
    : isNumber
      ? isDimensionScope(scopes) || (appendPxToUnscoped && isUnscoped(scopes))
        ? `${parseFloat(value as string)}px`
        : `${parseFloat(value as string)}`
      : isBool
        ? Boolean(value) ? 'var(--TRUE)' : 'var(--FALSE)'
        : `"${String(value)}"`;
}

/**
 * Resolves a VARIABLE_ALIAS value into a CSS var() reference
 * @param alias - The variable alias to resolve
 * @param groupSeparator - What Figma's `/` group delimiter becomes in the name
 * @param nameOptions - Per-run code-syntax option and rejection registry
 */
async function resolveCssAliasValue(alias: VariableAlias, groupSeparator: string, nameOptions: NameOptions): Promise<string> {
  const linkedVar = await figma.variables.getVariableByIdAsync(alias.id);
  if (!linkedVar) {
    return "initial";
  }
  return `var(${resolveCssVarName(linkedVar, groupSeparator, nameOptions)})`;
}

/**
 * Processes a variable collection into CSS format
 * @param collection - The variable collection to process
 * @param groupSeparator - What Figma's `/` group delimiter becomes in variable names
 * @param nameRegistry - Collects emitted name -> source names, for collision reporting
 * @param nameOptions - Per-run code-syntax option and rejection registry
 * @param appendPxToUnscoped - Emit `px` for numbers whose scoping is undecided
 * @returns Object containing root variables and theme-specific CSS blocks
 */
async function processCollection({
    name,
    modes,
    variableIds,
}: VariableCollection, groupSeparator: string, nameRegistry: Map<string, Set<string>>, nameOptions: NameOptions, appendPxToUnscoped: boolean): Promise<{ root: string[], theme: string[] }> {
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
          const cssVarName = resolveCssVarName(figVar, groupSeparator, nameOptions);
          const cssValue = typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS'
            ? await resolveCssAliasValue(value, groupSeparator, nameOptions)
            : formatCssValue(value, resolvedType, scopes, appendPxToUnscoped);

          recordEmittedVarName(nameRegistry, cssVarName, varName);
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
 * @param groupSeparator - What Figma's `/` group delimiter becomes in variable names
 * @param nameRegistry - Collects emitted name -> source names, for collision reporting
 * @param nameOptions - Per-run code-syntax option and rejection registry
 * @param appendPxToUnscoped - Emit `px` for numbers whose scoping is undecided
 */
async function processExtendedCollection(extCollection: ExtendedVariableCollection, groupSeparator: string, nameRegistry: Map<string, Set<string>>, nameOptions: NameOptions, appendPxToUnscoped: boolean): Promise<{ root: string[], theme: string[] }> {
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

          const cssVarName = resolveCssVarName(figVar, groupSeparator, nameOptions);
          const cssValue = typeof overrideValue === 'object' && 'type' in overrideValue && overrideValue.type === 'VARIABLE_ALIAS'
            ? await resolveCssAliasValue(overrideValue, groupSeparator, nameOptions)
            : formatCssValue(overrideValue, resolvedType, scopes, appendPxToUnscoped);

          recordEmittedVarName(nameRegistry, cssVarName, varName);
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
 * @param useSingleDashSeparator - Join Figma groups with a single dash instead of `--`
 * @param useCodeSyntaxName - Emit each variable under its Web code syntax, when it has one
 * @param appendPxToUnscoped - Append `px` to FLOAT values whose scoping is undecided
 *        (no scopes, or ALL_SCOPES). Scopes explicitly mapped to a non-dimension
 *        type stay unitless regardless.
 * @returns CSS string with custom properties and theme selectors
 */
export const exportToCSS = async (useSingleDashSeparator: boolean = false, useCodeSyntaxName: boolean = false, appendPxToUnscoped: boolean = false): Promise<string> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const groupSeparator = useSingleDashSeparator ? SINGLE_GROUP_SEPARATOR : DEFAULT_GROUP_SEPARATOR;
  try {
    const rootVars = new Set<string>();  // Use Set to avoid duplicates
    const nonRootBlocks: string[] = [];
    const nameRegistry = new Map<string, Set<string>>();
    const nameOptions: NameOptions = { useCodeSyntaxName, rejectedCodeSyntax: new Map<string, string>() };

    const baseCollections = collections.filter((collection) => !collection.isExtension);
    const extendedCollections = collections.filter((collection) => collection.isExtension) as unknown as ExtendedVariableCollection[];

    // Base collections are processed first so any extended-collection
    // overrides are declared later in the merged :root block and win
    // the CSS cascade.
    for(const collection of baseCollections) {
      const { root, theme } = await processCollection(collection, groupSeparator, nameRegistry, nameOptions, appendPxToUnscoped);
      root.forEach(v => rootVars.add(v));
      nonRootBlocks.push(...theme);
    }

    for (const extCollection of extendedCollections) {
      const { root, theme } = await processExtendedCollection(extCollection, groupSeparator, nameRegistry, nameOptions, appendPxToUnscoped);
      root.forEach(v => rootVars.add(v));
      nonRootBlocks.push(...theme);
    }

    // Create single root selector with all variables including TRUE/FALSE
    const rootBlock = `:root {\n  --TRUE: 1;\n  --FALSE: 0;\n${Array.from(rootVars).join('\n')}\n}`;

    const collisionComment = buildCollisionComment(nameRegistry);
    const codeSyntaxComment = buildCodeSyntaxComment(nameOptions.rejectedCodeSyntax);

    return [
      ...(codeSyntaxComment ? [codeSyntaxComment] : []),
      ...(collisionComment ? [collisionComment] : []),
      rootBlock,
      ...nonRootBlocks
    ].join('\n\n');
  } catch (err) {
    console.error(err);
    return `/* Something went wrong while converting:
            ${err}*/`;
  }
};
