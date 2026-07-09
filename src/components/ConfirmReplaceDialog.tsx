import React from "react";
import { AlertDialog, Button } from "figma-kit";
import { ImportMode } from "../types.d";

interface ConfirmReplaceDialogProps {
    open: boolean;
    mode: ImportMode;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

/**
 * Confirmation gate for the two destructive import modes (Sync and Clean).
 * Merge and Update only never show this — they never delete anything.
 */
export const ConfirmReplaceDialog: React.FC<ConfirmReplaceDialogProps> = ({
    open,
    mode,
    onOpenChange,
    onConfirm
}) => {
    const isClean = mode === ImportMode.CLEAN;

    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Content>
                <AlertDialog.Title>
                    {isClean ? "Delete all and import?" : "Merge and delete missing?"}
                </AlertDialog.Title>
                <AlertDialog.Description>
                    {isClean ? (
                        <>
                            This deletes <strong>all</strong> existing local variable
                            collections in this file — not just the ones named in the JSON
                            you&apos;re importing — and then recreates everything from the
                            file. Every existing component link to a variable is broken,
                            even where the recreated variable matches exactly. This
                            can&apos;t be undone through the plugin; Figma&apos;s own undo
                            (Cmd/Ctrl+Z) right afterwards may still work.
                        </>
                    ) : (
                        <>
                            This creates or updates collections, modes and variables from
                            the file, then deletes <strong>anything else in this
                            document</strong> that isn&apos;t present in the file —
                            including whole collections the file doesn&apos;t mention.
                            Any component linked to a deleted variable loses that link.
                            This can&apos;t be undone through the plugin; Figma&apos;s own
                            undo (Cmd/Ctrl+Z) right afterwards may still work.
                        </>
                    )}
                </AlertDialog.Description>
                <AlertDialog.Actions>
                    <AlertDialog.Cancel>
                        <Button variant="secondary">Cancel</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action onClick={onConfirm}>
                        <Button variant="destructive">
                            {isClean ? "Delete and import" : "Merge and delete"}
                        </Button>
                    </AlertDialog.Action>
                </AlertDialog.Actions>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
};
