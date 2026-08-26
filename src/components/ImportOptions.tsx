import React from "react";
import { Flex, RadioGroup, Label, Text, Input } from "figma-kit";
import { ImportMode } from "../types.d";
import { HelpTip } from "./HelpTip";

interface ImportOptionsProps {
    importMode: ImportMode;
    onImportModeChange: (importMode: ImportMode) => void;
    /** Shown only when the previewed file(s) actually carry `rem`/`em` values. */
    showRootFontSize?: boolean;
    rootFontSize?: string;
    onRootFontSizeChange?: (rootFontSize: string) => void;
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
 *
 * When the previewed file carries font-relative values, a root font size field
 * appears alongside them. It stays editable even while the reconciliation mode
 * is locked behind a shown preview, because changing it re-runs the dry run —
 * the diff on screen always shows the converted numbers the import would write.
 */
export const ImportOptions: React.FC<ImportOptionsProps> = ({
    importMode,
    onImportModeChange,
    showRootFontSize = false,
    rootFontSize = "16",
    onRootFontSizeChange,
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

            {showRootFontSize && onRootFontSizeChange && (
                <Flex gap="2" direction="column">
                    <Flex gap="2" align="center">
                        <Label htmlFor="varvar-import-root-font-size">
                            Root font size
                        </Label>
                        <HelpTip content="The file's rem/em values are multiplied by this to get the number Figma stores, so 2rem becomes 32. Defaults to 16, the browser default; an empty or invalid entry falls back to 16 rather than importing a broken value." />
                    </Flex>
                    <Flex gap="2" align="center">
                        <Input
                            id="varvar-import-root-font-size"
                            type="number"
                            min="1"
                            step="any"
                            value={rootFontSize}
                            selectOnClick
                            onChange={(event) => onRootFontSizeChange(event.target.value)}
                            style={{ width: '72px' }}
                        />
                        <Label htmlFor="varvar-import-root-font-size">px</Label>
                    </Flex>
                    <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                        This file contains rem/em values, which Figma has no equivalent
                        for. Each one is multiplied by this root font size on import —
                        with 16, <code>2rem</code> becomes <code>32</code>. The preview
                        updates to show the converted numbers.
                    </Text>
                </Flex>
            )}

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
