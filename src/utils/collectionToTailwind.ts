import { rgbToCssColor } from "./color";
import { toCssVar } from "./stringTransformation";

/**
 * Transforms variable names to Tailwind CSS v4+ conventions
 * @param name - Original variable name
 * @param resolvedType - Type of the variable
 * @returns Transformed name following Tailwind conventions
 */
function transformToTailwindName(name: string, resolvedType: string): string {
    const lowerName = name.toLowerCase();
    
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
        return `--color-${toCssVar(name)}`;
    }
    
    // Auto-detect spacing/size variables
    if (lowerName.includes('spacing') || 
        lowerName.includes('margin') || 
        lowerName.includes('padding') ||
        lowerName.includes('gap') ||
        lowerName.includes('space')) {
        return `--spacing-${toCssVar(name)}`;
    }
    
    // Auto-detect size variables
    if (lowerName.includes('size') || 
        lowerName.includes('width') || 
        lowerName.includes('height') ||
        lowerName.includes('radius') ||
        lowerName.includes('border')) {
        return `--size-${toCssVar(name)}`;
    }
    
    // Auto-detect typography variables
    if (lowerName.includes('font') || 
        lowerName.includes('text') || 
        lowerName.includes('line') ||
        lowerName.includes('letter') ||
        lowerName.includes('weight')) {
        if (lowerName.includes('family') || lowerName.includes('font')) {
            return `--font-family-${toCssVar(name)}`;
        } else if (lowerName.includes('size')) {
            return `--font-size-${toCssVar(name)}`;
        } else if (lowerName.includes('weight')) {
            return `--font-weight-${toCssVar(name)}`;
        } else if (lowerName.includes('line')) {
            return `--line-height-${toCssVar(name)}`;
        } else if (lowerName.includes('letter')) {
            return `--letter-spacing-${toCssVar(name)}`;
        }
        return `--font-${toCssVar(name)}`;
    }
    
    // Auto-detect animation/transition variables
    if (lowerName.includes('duration') || 
        lowerName.includes('delay') || 
        lowerName.includes('ease') ||
        lowerName.includes('transition') ||
        lowerName.includes('animation')) {
        return `--duration-${toCssVar(name)}`;
    }
    
    // Auto-detect shadow variables
    if (lowerName.includes('shadow') || lowerName.includes('drop')) {
        return `--shadow-${toCssVar(name)}`;
    }
    
    // Auto-detect opacity variables
    if (lowerName.includes('opacity') || lowerName.includes('alpha')) {
        return `--opacity-${toCssVar(name)}`;
    }
    
    // Keep original naming as fallback for unrecognized patterns
    return `--${toCssVar(name)}`;
}

/**
 * Processes a variable collection into Tailwind CSS v4+ format
 * @param collection - The variable collection to process
 * @returns Object containing theme variables and custom variants
 */
async function processCollection({
    name,
    modes,
    variableIds,
}: VariableCollection): Promise<{ theme: string[], variants: string[] }> {
    const themeVars: string[] = [];
    const customVariants: string[] = [];
    const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

    for(const mode of modes) {
        let cssVars: string[] = [];

        for (const variableId of variableIds) {
            const figVar = await figma.variables.getVariableByIdAsync(variableId);
            if (figVar !== null) {
                const { name, resolvedType, valuesByMode }: Variable = figVar;
                const value: VariableValue = valuesByMode[mode.modeId];

                if (value !== undefined && validTypes.has(resolvedType)) {
                    const tailwindVarName = transformToTailwindName(name, resolvedType);
                    let cssValue: string;
        
                    const isColor: boolean = resolvedType === "COLOR";
                    const isNumber: boolean = resolvedType === "FLOAT";
                    const isBool: boolean = resolvedType === "BOOLEAN";

                    if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
                        const linkedVar = await figma.variables.getVariableByIdAsync(value.id);

                        if(linkedVar) {
                            const linkedName = transformToTailwindName(linkedVar.name, linkedVar.resolvedType);
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
                                ? `${parseFloat(value as string)}px`
                                : isBool
                                    ? Boolean(value) ? '1' : '0'
                                    : `"${String(value)}"`;
                    }
                    cssVars.push(`  ${tailwindVarName}: ${cssValue};`);
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
 * @returns Tailwind CSS string with @theme directive and @custom-variant directives
 */
export const exportToTailwind = async (): Promise<string> => {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    try {
        const themeVars = new Set<string>();  // Use Set to avoid duplicates
        const customVariants: string[] = [];
        
        for(const collection of collections) {
            const { theme, variants } = await processCollection(collection);
            theme.forEach(v => themeVars.add(v));
            customVariants.push(...variants);
        }

        // Create @theme block with all variables
        const themeBlock = `@theme {\n${Array.from(themeVars).join('\n')}\n}`;

        // Combine theme and custom variants
        const result = [themeBlock, ...customVariants].join('\n\n');
        
        return result;
    } catch (err) {
        console.error(err);
        return `/* Something went wrong while converting to Tailwind CSS:
            ${err}*/`;
    }
};
