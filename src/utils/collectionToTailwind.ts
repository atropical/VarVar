import { rgbToCssColor } from "./color";
import { formatFloat32 } from "./numberFormat";
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
import { shouldUnitizeNumericValue } from "./scopeToDTCG";
import { DEFAULT_UNIT_OPTIONS, formatNumericValue, toUnitOptions } from "./units";
import type { UnitOptions } from "./units";
import type { ExportUnit } from "../types.d";

/**
 * Maps a Figma variable scope to its Tailwind v4 theme namespace token.
 * An empty string means "decided, but no namespace" (a plain `--` variable);
 * an absent entry means the scope carries no naming information at all.
 */
const SCOPE_TO_TAILWIND_NAMESPACE: Partial<Record<VariableScope, string>> = {
    FONT_SIZE: "text",
    FONT_WEIGHT: "font-weight",
    FONT_FAMILY: "font",
    LETTER_SPACING: "tracking",
    LINE_HEIGHT: "leading",
    CORNER_RADIUS: "radius",
    GAP: "spacing",
    WIDTH_HEIGHT: "spacing",
    PARAGRAPH_SPACING: "spacing",
    PARAGRAPH_INDENT: "spacing",
    STROKE_FLOAT: "spacing",
    EFFECT_FLOAT: "spacing",
    ALL_FILLS: "color",
    FRAME_FILL: "color",
    SHAPE_FILL: "color",
    TEXT_FILL: "color",
    STROKE_COLOR: "color",
    EFFECT_COLOR: "color",
    OPACITY: "opacity",
    FONT_STYLE: "",
    TEXT_CONTENT: "",
};

/**
 * Resolves a Figma variable's scopes to a Tailwind v4 theme namespace token.
 * ALL_SCOPES, empty scopes, unmapped scopes and scopes that disagree on a
 * namespace are all treated as undecided.
 * @param scopes - The variable's scopes
 * @returns The namespace token ("" for no namespace), or undefined when undecided
 */
function resolveTailwindNamespace(scopes: VariableScope[]): string | undefined {
    if (!scopes || scopes.length === 0 || scopes.includes("ALL_SCOPES")) {
        return undefined;
    }

    const mapped = scopes
        .map((scope) => SCOPE_TO_TAILWIND_NAMESPACE[scope])
        .filter((namespace): namespace is string => namespace !== undefined);

    if (mapped.length === 0) {
        return undefined;
    }

    // If every mapped scope agrees on a namespace, use it; otherwise stay undecided.
    const [first, ...rest] = mapped;
    const allAgree = rest.every((namespace) => namespace === first);
    return allAgree ? first : undefined;
}

/**
 * Strips a leading group segment that merely echoes the namespace it is about to
 * be prefixed with, so `text/h1` scoped to font size becomes `--text-h1` rather
 * than `--text-text--h1`.
 * @param name - Original variable name
 * @param namespace - The resolved Tailwind namespace token
 * @param groupSeparator - What Figma's `/` group delimiter becomes in names
 * @returns The name without its namespace-echoing group segment
 */
function stripEchoedNamespace(name: string, namespace: string, groupSeparator: string): string {
    const segments = name.split("/");
    if (segments.length < 2) {
        return name;
    }
    if (toCssVar(segments[0].trim(), false, groupSeparator) === namespace) {
        return segments.slice(1).join("/");
    }
    return name;
}

/**
 * Transforms variable names to Tailwind CSS v4+ conventions
 * @param name - Original variable name
 * @param resolvedType - Type of the variable
 * @param scopes - The variable's scopes, which take precedence over name heuristics
 * @param groupSeparator - What Figma's `/` group delimiter becomes in the emitted name
 * @returns Transformed name following Tailwind conventions
 */
function transformToTailwindName(
    name: string,
    resolvedType: string,
    scopes: VariableScope[] = [],
    groupSeparator: string = DEFAULT_GROUP_SEPARATOR
): string {
    const lowerName = name.toLowerCase();

    // Scopes are authoritative: a variable scoped to font-size is a `--text-*`,
    // one scoped to font-weight is a `--font-weight-*`, and so on.
    const scopedNamespace = resolveTailwindNamespace(scopes);
    if (scopedNamespace !== undefined) {
        return scopedNamespace === ""
            ? `--${toCssVar(name, false, groupSeparator)}`
            : `--${scopedNamespace}-${toCssVar(stripEchoedNamespace(name, scopedNamespace, groupSeparator), false, groupSeparator)}`;
    }

    // Auto-detect color variables
    if (resolvedType === "COLOR" || 
        lowerName.includes('color') || 
        lowerName.includes('primary') || 
        lowerName.includes('secondary') || 
        lowerName.includes('accent') ||
        lowerName.includes('background') ||
        lowerName.includes('foreground') ||
        lowerName.includes('border') ||
        lowerName.includes('text')) {
        return `--color-${toCssVar(name, false, groupSeparator)}`;
    }
    
    // Auto-detect spacing/size variables
    if (lowerName.includes('spacing') || 
        lowerName.includes('margin') || 
        lowerName.includes('padding') ||
        lowerName.includes('gap') ||
        lowerName.includes('space')) {
        return `--spacing-${toCssVar(name, false, groupSeparator)}`;
    }
    
    // Auto-detect size variables
    if (lowerName.includes('size') || 
        lowerName.includes('width') || 
        lowerName.includes('height') ||
        lowerName.includes('radius') ||
        lowerName.includes('border')) {
        return `--size-${toCssVar(name, false, groupSeparator)}`;
    }
    
    // Auto-detect typography variables
    if (lowerName.includes('font') || 
        lowerName.includes('text') || 
        lowerName.includes('line') ||
        lowerName.includes('letter') ||
        lowerName.includes('weight')) {
        if (lowerName.includes('family') || lowerName.includes('font')) {
            return `--font-family-${toCssVar(name, false, groupSeparator)}`;
        } else if (lowerName.includes('size')) {
            return `--font-size-${toCssVar(name, false, groupSeparator)}`;
        } else if (lowerName.includes('weight')) {
            return `--font-weight-${toCssVar(name, false, groupSeparator)}`;
        } else if (lowerName.includes('line')) {
            return `--line-height-${toCssVar(name, false, groupSeparator)}`;
        } else if (lowerName.includes('letter')) {
            return `--letter-spacing-${toCssVar(name, false, groupSeparator)}`;
        }
        return `--font-${toCssVar(name, false, groupSeparator)}`;
    }
    
    // Auto-detect animation/transition variables
    if (lowerName.includes('duration') || 
        lowerName.includes('delay') || 
        lowerName.includes('ease') ||
        lowerName.includes('transition') ||
        lowerName.includes('animation')) {
        return `--duration-${toCssVar(name, false, groupSeparator)}`;
    }
    
    // Auto-detect shadow variables
    if (lowerName.includes('shadow') || lowerName.includes('drop')) {
        return `--shadow-${toCssVar(name, false, groupSeparator)}`;
    }
    
    // Auto-detect opacity variables
    if (lowerName.includes('opacity') || lowerName.includes('alpha')) {
        return `--opacity-${toCssVar(name, false, groupSeparator)}`;
    }
    
    // Keep original naming as fallback for unrecognized patterns
    return `--${toCssVar(name, false, groupSeparator)}`;
}

/**
 * Resolves the `--`-prefixed name a variable is emitted as in the @theme block.
 * With the code-syntax option on, a usable `codeSyntax.WEB` wins over the
 * namespaced Tailwind name; anything that couldn't be a CSS custom property
 * name is recorded and falls back to the derived name.
 * @param figVar - The Figma variable being named
 * @param groupSeparator - What Figma's `/` group delimiter becomes in the name
 * @param nameOptions - Per-run code-syntax option and rejection registry
 */
function resolveTailwindVarName(figVar: Variable, groupSeparator: string, nameOptions: NameOptions): string {
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
    return transformToTailwindName(figVar.name, figVar.resolvedType, figVar.scopes, groupSeparator);
}

/**
 * Processes a variable collection into Tailwind CSS v4+ format
 * @param collection - The variable collection to process
 * @param groupSeparator - What Figma's `/` group delimiter becomes in variable names
 * @param nameRegistry - Collects emitted name -> source names, for collision reporting
 * @param nameOptions - Per-run code-syntax option and rejection registry
 * @param unitOptions - The unit (and root font size) numeric dimensions are emitted with
 * @param appendPxToUnscoped - Also unitize numbers whose scoping is undecided
 * @returns Object containing theme variables and custom variants
 */
async function processCollection({
    name,
    modes,
    variableIds,
}: VariableCollection, groupSeparator: string, nameRegistry: Map<string, Set<string>>, nameOptions: NameOptions, unitOptions: UnitOptions, appendPxToUnscoped: boolean): Promise<{ theme: string[], variants: string[] }> {
    const themeVars: string[] = [];
    const customVariants: string[] = [];
    const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

    for(const mode of modes) {
        let cssVars: string[] = [];

        for (const variableId of variableIds) {
            const figVar = await figma.variables.getVariableByIdAsync(variableId);
            if (figVar !== null) {
                const { name, resolvedType, valuesByMode, scopes, description }: Variable = figVar;
                const value: VariableValue = valuesByMode[mode.modeId];

                if (value !== undefined && validTypes.has(resolvedType)) {
                    const tailwindVarName = resolveTailwindVarName(figVar, groupSeparator, nameOptions);
                    recordEmittedVarName(nameRegistry, tailwindVarName, name);
                    let cssValue: string;
        
                    const isColor: boolean = resolvedType === "COLOR";
                    const isNumber: boolean = resolvedType === "FLOAT";
                    const isBool: boolean = resolvedType === "BOOLEAN";

                    if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
                        const linkedVar = await figma.variables.getVariableByIdAsync(value.id);

                        if(linkedVar) {
                            const linkedName = resolveTailwindVarName(linkedVar, groupSeparator, nameOptions);
                            cssValue = `var(${linkedName})`;
                        }
                        else {
                            cssValue = "initial";
                        }
                    }
                    else {
                        cssValue = isColor 
                            ? rgbToCssColor(value as RGBA)
                            : isNumber
                                ? shouldUnitizeNumericValue(scopes, appendPxToUnscoped)
                                    ? formatNumericValue(Number(value), unitOptions)
                                    : formatFloat32(Number(value))
                                : isBool
                                    ? Boolean(value) ? '1' : '0'
                                    : `"${String(value)}"`;
                    }
                    cssVars.push(`  ${tailwindVarName}: ${cssValue};${description ? `\t/* ${description} */` : ''}`);
                }
            } 
        }
        
        const isRoot = (mode.name === 'Default' || mode.name === 'Mode 1');
        if(isRoot) {
            themeVars.push(...cssVars);
        }
        else {
            // Create custom variant for non-default modes
            const variantName = `theme-${toCssVar(mode.name)}`;
            const selector = `&:where([data-theme="${mode.name}"] *)`;
            customVariants.push(`@custom-variant ${variantName} (${selector});`);
            
            // Add mode-specific variables to theme block
            themeVars.push(...cssVars);
        }
        cssVars = [];
    }
    
    return { theme: themeVars, variants: customVariants };
}

/**
 * Exports all local variable collections to Tailwind CSS v4+ format
 * @param useSingleDashSeparator - Join Figma groups with a single dash instead of `--`.
 *        Defaults to true: Tailwind IntelliSense only suggests theme variables whose
 *        segments are joined by single dashes.
 * @param useCodeSyntaxName - Emit each variable under its Web code syntax, when it has one
 * @param exportUnit - The unit FLOAT values Figma scopes as dimensions are emitted
 *        with. Scopes explicitly mapped to a non-dimension type stay unitless regardless.
 * @param rootFontSize - What a `rem` conversion divides by
 * @param appendPxToUnscoped - Also give the unit to FLOAT values whose scoping is
 *        undecided (no scopes, or ALL_SCOPES). Off by default.
 * @returns Tailwind CSS string with @theme directive and @custom-variant directives
 */
export const exportToTailwind = async (useSingleDashSeparator: boolean = true, useCodeSyntaxName: boolean = false, exportUnit: ExportUnit = DEFAULT_UNIT_OPTIONS.unit, rootFontSize: number = DEFAULT_UNIT_OPTIONS.rootFontSize, appendPxToUnscoped: boolean = false): Promise<string> => {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const groupSeparator = useSingleDashSeparator ? SINGLE_GROUP_SEPARATOR : DEFAULT_GROUP_SEPARATOR;
    const unitOptions = toUnitOptions(exportUnit, rootFontSize);
    try {
        const themeVars = new Set<string>();  // Use Set to avoid duplicates
        const customVariants: string[] = [];
        const nameRegistry = new Map<string, Set<string>>();
        const nameOptions: NameOptions = { useCodeSyntaxName, rejectedCodeSyntax: new Map<string, string>() };

        for(const collection of collections) {
            const { theme, variants } = await processCollection(collection, groupSeparator, nameRegistry, nameOptions, unitOptions, appendPxToUnscoped);
            theme.forEach(v => themeVars.add(v));
            customVariants.push(...variants);
        }

        // Create @theme block with all variables
        const themeBlock = `@theme {\n${Array.from(themeVars).join('\n')}\n}`;

        const collisionComment = buildCollisionComment(nameRegistry);
        const codeSyntaxComment = buildCodeSyntaxComment(nameOptions.rejectedCodeSyntax);

        // Combine theme and custom variants
        const result = [
            ...(codeSyntaxComment ? [codeSyntaxComment] : []),
            ...(collisionComment ? [collisionComment] : []),
            themeBlock,
            ...customVariants
        ].join('\n\n');

        return result;
    } catch (err) {
        console.error(err);
        return `/* Something went wrong while converting to Tailwind CSS:
            ${err}*/`;
    }
};
