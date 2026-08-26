/**
 * Finds a matching mode name in the linked variable's collection
 * @param currentModeName - The current mode name to match
 * @param linkedVarCollection - The variable collection to search in
 * @returns The matched mode name or the first mode's name as fallback
 */
export function getMatchingModeName(
    currentModeName: string,
    linkedVarCollection: VariableCollection
): string {
    const matchedMode = linkedVarCollection.modes.find(
        mode => mode.name === currentModeName
    );
    
    return matchedMode 
        ? matchedMode.name 
        : linkedVarCollection.modes[0].name;
}


/**
 * A Figma variable's per-platform "Code Syntax" overrides, in the same shape
 * as {@link Variable.codeSyntax}.
 */
export type CodeSyntaxMap = { [platform in CodeSyntaxPlatform]?: string };

/** Every platform Figma supports a code-syntax override for, in a stable order. */
export const CODE_SYNTAX_PLATFORMS: CodeSyntaxPlatform[] = ["WEB", "ANDROID", "iOS"];

/**
 * Narrows a variable's `codeSyntax` to the platforms that actually carry a
 * non-empty override, so exporters can skip the field entirely when the user
 * never set one.
 * @param codeSyntax - The raw `variable.codeSyntax` object
 * @returns The non-empty overrides, or `undefined` when there are none
 */
export function normalizeCodeSyntax(codeSyntax: CodeSyntaxMap | undefined): CodeSyntaxMap | undefined {
    if (!codeSyntax) return undefined;

    const result: CodeSyntaxMap = {};
    let hasAny = false;
    for (const platform of CODE_SYNTAX_PLATFORMS) {
        const value = codeSyntax[platform];
        if (typeof value === "string" && value.trim() !== "") {
            result[platform] = value;
            hasAny = true;
        }
    }

    return hasAny ? result : undefined;
}
