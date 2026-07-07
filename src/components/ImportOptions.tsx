import React from "react";
import { Flex, Switch, Label, Text } from "figma-kit";

interface ImportOptionsProps {
    replaceExisting: boolean;
    onReplaceExistingChange: (replaceExisting: boolean) => void;
}

/**
 * Import-specific options: the "replace existing variables" toggle. This is
 * destructive (wipes every local variable collection before importing), so
 * it defaults to off and is always followed by a confirmation dialog.
 */
export const ImportOptions: React.FC<ImportOptionsProps> = ({
    replaceExisting,
    onReplaceExistingChange
}) => {
    return (
        <Flex gap="2" direction="column">
            <Label style={{ color: 'var(--figma-color-text-secondary)' }}>
                Options
            </Label>

            <Flex gap="2">
                <Switch
                    id="varvar-import-replace-existing"
                    onCheckedChange={onReplaceExistingChange}
                    checked={replaceExisting}
                    style={{ flexShrink: 0 }}
                />
                <Label htmlFor="varvar-import-replace-existing">
                    Replace existing variables
                </Label>
                <span title="Deletes every existing local variable collection in this file before importing, so the result matches the JSON exactly. This is not limited to collections named in the file — everything is wiped first. You'll be asked to confirm." style={{ backgroundColor: 'var(--figma-color-text-secondary)', fontFamily: 'sans-serif', cursor: 'help', userSelect: 'none', color: 'var(--figma-color-text-secondary-inverse)', borderRadius: '50%', padding: '1px', fontSize: '.6em', width: '1em', height: '1em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>?</span>
            </Flex>

            {replaceExisting && (
                <Flex style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    backgroundColor: "rgba(234, 179, 8, 0.15)",
                }}>
                    <Text weight="strong" style={{ color: 'var(--figma-color-text)' }}>
                        Warning: this deletes all existing variables before importing
                    </Text>
                </Flex>
            )}
        </Flex>
    );
};
