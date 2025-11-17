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

