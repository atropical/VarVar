import { rgbToCssColor } from "./color";
import { toCamelCase } from "./stringTransformation";
import { getMatchingModeName, normalizeCodeSyntax } from "./variableUtils";
import type { CodeSyntaxMap } from "./variableUtils";
import { resolveScopedType } from "./scopeToDTCG";

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/** A property name that can be written unquoted in the emitted object literal. */
const JS_IDENTIFIER = /^[$A-Za-z_][$A-Za-z0-9_]*$/;

/**
 * Resolves the property path a variable is emitted under, as camelCased
 * segments of its Figma name.
 *
 * With the code-syntax option on, a `codeSyntax.WEB` override replaces the
 * whole path with a single key (the override is the variable's name in code,
 * groups included), stripped of the leading `--` Figma users commonly type.
 * JavaScript can't spell an arbitrary CSS custom property name as a property
 * path, so an override that isn't already a valid identifier is camelCased,
 * and one that still isn't falls back to the derived path.
 * @param figVar - The Figma variable being named
 * @param useCodeSyntaxName - Whether the Web code syntax should drive the name
 */
function resolveJsNameParts(figVar: Variable, useCodeSyntaxName: boolean): string[] {
  if (useCodeSyntaxName) {
    const override = figVar.codeSyntax?.WEB;
    const bare = typeof override === "string" ? override.trim().replace(/^--/, "") : "";
    if (bare !== "") {
      if (JS_IDENTIFIER.test(bare)) {
        return [bare];
      }
      const camelCased = toCamelCase(bare);
      if (JS_IDENTIFIER.test(camelCased)) {
        return [camelCased];
      }
    }
  }
  return figVar.name.split("/").map((str) => toCamelCase(str));
}

/**
 * Builds one variable's emitted value object. `codeSyntax` is included
 * whenever the variable carries any platform override, so the JS output stays
 * as lossless as the JSON one.
 * @param value - The already-formatted value (literal or alias property path)
 * @param description - The variable's description, omitted when empty
 * @param dtcgType - The DTCG type resolved from the variable's scopes
 * @param codeSyntax - The variable's non-empty code syntax overrides, if any
 * @param inherited - Extended-collection inheritance flag, omitted for base collections
 */
function buildJsValueEntry(
  value: unknown,
  description: string,
  dtcgType: string,
  codeSyntax: CodeSyntaxMap | undefined,
  inherited?: boolean
): Record<string, unknown> {
  const entry: Record<string, unknown> = { value };
  if (description) entry.description = description;
  entry.dtcgType = dtcgType;
  if (inherited !== undefined) entry.inherited = inherited;
  if (codeSyntax) entry.codeSyntax = codeSyntax;
  return entry;
}

/**
 * Builds a JS property-path reference (e.g. "brand.mode.color.primary.value")
 * to another variable, prefixed with its collection when it differs from the
 * referencing collection
 * @param targetParts - The emitted property-path segments of the referenced variable
 * @param targetModeName - The mode name to reference in the target collection
 * @param targetCollectionName - The name of the collection the variable lives in
 * @param currentCollectionName - The name of the collection containing the reference
 */
function buildJsAliasPath(
  targetParts: string[],
  targetModeName: string,
  targetCollectionName: string,
  currentCollectionName: string
): string {
  const collPrefix = targetCollectionName !== currentCollectionName
    ? `${toCamelCase(targetCollectionName)}.`
    : '';
  return `${collPrefix}${toCamelCase(targetModeName)}.${targetParts.join('.')}.value`;
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
 * @param useCodeSyntaxName - Emit each variable under its Web code syntax, when it has one
 * @returns JavaScript export string for the collection
 */
async function processCollection({
    name,
    modes,
    variableIds,
}: VariableCollection, useCodeSyntaxName: boolean): Promise<string> {
  const variables: Record<string, any> = {};

  for (const mode of modes) {
    variables[toCamelCase(mode.name)] = {};

    for (const variableId of variableIds) {
      const figVar = await figma.variables.getVariableByIdAsync(variableId);
      if (figVar !== null) {
        const { name, resolvedType, valuesByMode, scopes, description, codeSyntax }: Variable = figVar;
        const value: VariableValue = valuesByMode[mode.modeId];
        const dtcgType = resolveScopedType(scopes, resolvedType);
        const usedCodeSyntax = normalizeCodeSyntax(codeSyntax);

        if (value !== undefined && validTypes.has(resolvedType)) {
          let currentObj = variables[toCamelCase(mode.name)];
          const parts = resolveJsNameParts(figVar, useCodeSyntaxName);

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
                    resolveJsNameParts(linkedVar, useCodeSyntaxName),
                    matchedModeName,
                    linkedVarCollection ? linkedVarCollection.name : name,
                    name
                  );
                  currentObj[part] = buildJsValueEntry(aliasValue, description, dtcgType, usedCodeSyntax);
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

                currentObj[part] = buildJsValueEntry(processedValue, description, dtcgType, usedCodeSyntax);
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
 * @param useCodeSyntaxName - Emit each variable under its Web code syntax, when it has one
 * @returns JavaScript export string for the extended collection
 */
async function processExtendedCollection(extCollection: ExtendedVariableCollection, useCodeSyntaxName: boolean): Promise<string> {
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
        const { name: varName, resolvedType, scopes, description, codeSyntax }: Variable = figVar;

        if (validTypes.has(resolvedType)) {
          const dtcgType = resolveScopedType(scopes, resolvedType);
          const usedCodeSyntax = normalizeCodeSyntax(codeSyntax);
          const overridesForVar = variableOverrides[variableId];
          const overrideValue: VariableValue | undefined = overridesForVar
            ? overridesForVar[mode.modeId]
            : undefined;
          const isInherited = overrideValue === undefined;

          let currentObj = variables[toCamelCase(mode.name)];
          const parts = resolveJsNameParts(figVar, useCodeSyntaxName);

          for (let i = 0, partsLength = parts.length; i < partsLength; i++) {
            const part = parts[i];

            if (i === partsLength - 1) {
              if (isInherited) {
                const parentModeName = parentMode ? parentMode.name : mode.name;
                const parentCollName = parentCollection ? parentCollection.name : name;
                const aliasValue = buildJsAliasPath(parts, parentModeName, parentCollName, name);
                currentObj[part] = buildJsValueEntry(aliasValue, description, dtcgType, usedCodeSyntax, true);
              }
              else if (typeof overrideValue === 'object' && 'type' in overrideValue && overrideValue.type === 'VARIABLE_ALIAS') {
                const linkedVar = await figma.variables.getVariableByIdAsync(overrideValue.id);

                if (linkedVar) {
                  const linkedVarCollection = await figma.variables.getVariableCollectionByIdAsync(linkedVar.variableCollectionId);
                  const matchedModeName = linkedVarCollection
                    ? getMatchingModeName(mode.name, linkedVarCollection)
                    : mode.name;
                  const aliasValue = buildJsAliasPath(
                    resolveJsNameParts(linkedVar, useCodeSyntaxName),
                    matchedModeName,
                    linkedVarCollection ? linkedVarCollection.name : name,
                    name
                  );
                  currentObj[part] = buildJsValueEntry(aliasValue, description, dtcgType, usedCodeSyntax, false);
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

                currentObj[part] = buildJsValueEntry(processedValue, description, dtcgType, usedCodeSyntax, false);
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
 * @param useCodeSyntaxName - Emit each variable under its Web code syntax, when it has one
 * @returns JavaScript string with exported variable objects
 */
export const exportToJS = async (useCodeSyntaxName: boolean = false): Promise<string | undefined> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  try {
    const exports: string[] = [];

    const baseCollections = collections.filter((collection) => !collection.isExtension);
    const extendedCollections = collections.filter((collection) => collection.isExtension) as unknown as ExtendedVariableCollection[];

    for (const collection of baseCollections) {
      exports.push(await processCollection(collection, useCodeSyntaxName));
    }
    for (const extCollection of extendedCollections) {
      exports.push(await processExtendedCollection(extCollection, useCodeSyntaxName));
    }

    return exports.join('\n');
  } catch (err) {
    console.error(err);
  }
};
