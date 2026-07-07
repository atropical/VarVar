import React from "react";
import { AlertDialog, Button } from "figma-kit";

interface ConfirmReplaceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

/**
 * Confirmation gate for the destructive "replace existing variables" import
 * path. Shown only when the user triggers an import with that toggle on.
 */
export const ConfirmReplaceDialog: React.FC<ConfirmReplaceDialogProps> = ({
    open,
    onOpenChange,
    onConfirm
}) => {
    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Content>
                <AlertDialog.Title>Replace existing variables?</AlertDialog.Title>
                <AlertDialog.Description>
                    This deletes <strong>all</strong> existing local variable collections
                    in this file — not just the ones named in the JSON you're importing —
                    and then recreates everything from the file. This can&apos;t be undone
                    through the plugin; Figma&apos;s own undo (Cmd/Ctrl+Z) right afterwards
                    may still work.
                </AlertDialog.Description>
                <AlertDialog.Actions>
                    <AlertDialog.Cancel>
                        <Button variant="secondary">Cancel</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action onClick={onConfirm}>
                        <Button variant="destructive">Delete and import</Button>
                    </AlertDialog.Action>
                </AlertDialog.Actions>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
};
