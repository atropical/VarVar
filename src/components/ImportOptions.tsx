import React from "react";
import { Flex, RadioGroup, Label, Text } from "figma-kit";
import { ImportMode } from "../types.d";

interface ImportOptionsProps {
    importMode: ImportMode;
    onImportModeChange: (importMode: ImportMode) => void;
    disabled?: boolean;
}

/**
 * Import-specific options: how to reconcile the imported file against
 * existing local variables. Merge and Update only never delete anything, so
 * existing component bindings are never broken. Sync deletes only what has no
 * match in the file (matches are updated in place, keeping their bindings);
 * Clean deletes everything up front and recreates it, so even variables that
 * match the file exactly lose their bindings. Both show a warning and (in the
 * parent view) require confirmation before running.
 */
export const ImportOptions: React.FC<ImportOptionsProps> = ({
    importMode,
    onImportModeChange,
    disabled = false
}) => {
    return (
        <Flex gap="2" direction="column">
            <Label style={{ color: 'var(--figma-color-text-secondary)' }}>
                Options
            </Label>

            {disabled && (
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Locked while a preview is shown — click Back to change these.
                </Text>
            )}

            <RadioGroup.Root
                orientation="vertical"
                value={importMode}
                disabled={disabled}
                onValueChange={(value) => onImportModeChange(value as ImportMode)}
            >
                <RadioGroup.Label>
                    <RadioGroup.Item value={ImportMode.MERGE} />
                    Merge
                </RadioGroup.Label>
                <RadioGroup.Label>
                    <RadioGroup.Item value={ImportMode.UPDATE_ONLY} />
                    Update only
                </RadioGroup.Label>
                <RadioGroup.Label>
                    <RadioGroup.Item value={ImportMode.SYNC} />
                    Merge and delete anything not in the file
                </RadioGroup.Label>
                <RadioGroup.Label>
                    <RadioGroup.Item value={ImportMode.CLEAN} />
                    Clean import (delete everything first)
                </RadioGroup.Label>
            </RadioGroup.Root>

            {importMode === ImportMode.MERGE && (
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Creates missing collections, modes and variables, and updates any
                    that already match by name. Nothing existing is ever deleted, so
                    existing component links are never broken.
                </Text>
            )}

            {importMode === ImportMode.UPDATE_ONLY && (
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Only updates variables, modes and collections that already exist
                    locally and are also present in the file. Nothing is created and
                    nothing is deleted.
                </Text>
            )}

            {importMode === ImportMode.SYNC && (
                <Flex style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    backgroundColor: "rgba(234, 179, 8, 0.15)",
                }}>
                    <Text weight="strong" style={{ color: 'var(--figma-color-text)' }}>
                        Warning: after merging, anything in this document not present in
                        the file is deleted — including whole collections the file
                        doesn&apos;t mention. Only variables with no match in the file are
                        deleted; components using a variable that's also in the file keep
                        their link, since that variable is updated in place, not deleted.
                    </Text>
                </Flex>
            )}

            {importMode === ImportMode.CLEAN && (
                <Flex style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    backgroundColor: "rgba(234, 179, 8, 0.15)",
                }}>
                    <Text weight="strong" style={{ color: 'var(--figma-color-text)' }}>
                        Warning: this deletes every existing local variable collection —
                        not just the ones named in the file — before importing. Every
                        variable is recreated from scratch, so every existing component
                        link is broken, even for variables that match the file exactly.
                    </Text>
                </Flex>
            )}
        </Flex>
    );
};
