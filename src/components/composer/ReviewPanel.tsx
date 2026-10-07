import React, { useState } from "react";
import { AlertDialog, Button, Flex, Text } from "figma-kit";
import type { StyleChange } from "../../composer/ops";
import { STYLE_KIND_LABELS } from "../../composer/types";
import type { UsageState } from "../../hooks/useComposer";
import { USAGE_CAP } from "../../hooks/useComposer";
import { ActionTag, muted, panel } from "./ui";

interface ReviewPanelProps {
    changes: StyleChange[];
    orderChanged: boolean;
    usageFor: (key: string) => UsageState | undefined;
    applying: boolean;
    readOnly: boolean;
    onApply: () => void;
    onBack: () => void;
    onRevert: (key: string) => void;
}

const usageText = (u?: UsageState) =>
    u?.status === "done" ? `used by ${u.capped ? `${USAGE_CAP}+` : u.count}` : u?.status === "counting" || u?.status === "slow" ? "counting usage…" : "";

/**
 * The dry run: every pending create, update and delete with its field-level
 * changes, before anything is written. Deletes need one more confirmation.
 */
export const ReviewPanel: React.FC<ReviewPanelProps> = ({ changes, orderChanged, usageFor, applying, readOnly, onApply, onBack, onRevert }) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const deletes = changes.filter((c) => c.action === "delete");
    const counts = { create: 0, update: 0, delete: 0 };
    for (const c of changes) counts[c.action] += 1;
    const total = changes.length + (orderChanged ? 1 : 0);

    return (
        <Flex direction="column" gap="3" style={{ flex: 1, minHeight: 0 }}>
            <Flex gap="2" align="center">
                <Text size="large" weight="strong">Review changes</Text>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={onBack} disabled={applying}>Back to editing</Button>
                <Button
                    variant="primary"
                    disabled={total === 0 || applying || readOnly}
                    onClick={() => (deletes.length > 0 ? setConfirmOpen(true) : onApply())}
                >
                    {applying ? "Applying…" : `Apply ${total} change${total === 1 ? "" : "s"}`}
                </Button>
            </Flex>
            <Text style={muted}>
                Nothing has been written yet. {counts.create} to create, {counts.update} to update, {counts.delete} to delete{orderChanged ? ", and a new style order" : ""}.
                Applying is a single undo step in Figma.
            </Text>
            {total === 0 && <Text style={muted}>No pending changes.</Text>}
            {orderChanged && (
                <Flex gap="2" align="center" style={panel}>
                    <ActionTag action="update" />
                    <Text weight="strong">Style order</Text>
                    <Text style={muted}>Styles are re-sequenced to match the list (within each folder).</Text>
                </Flex>
            )}
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                <Flex direction="column" gap="2">
                    {changes.map((c) => (
                        <Flex key={c.key} direction="column" gap="1" style={panel}>
                            <Flex gap="2" align="center">
                                <ActionTag action={c.action} />
                                <Text weight="strong">{c.name}</Text>
                                <Text style={muted}>{STYLE_KIND_LABELS[c.kind]}</Text>
                                <Text style={muted}>{usageText(usageFor(c.key))}</Text>
                                <div style={{ flex: 1 }} />
                                {!applying && <Button variant="text" onClick={() => onRevert(c.key)}>{c.action === "create" ? "Discard" : "Revert"}</Button>}
                            </Flex>
                            {c.lines.map((line, i) => (
                                <Text key={i} style={{ fontFamily: "monospace", fontSize: 11, marginLeft: 8 }}>{line}</Text>
                            ))}
                        </Flex>
                    ))}
                </Flex>
            </div>

            <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Title>Delete {deletes.length} style{deletes.length === 1 ? "" : "s"}?</AlertDialog.Title>
                    <AlertDialog.Description>
                        Layers using {deletes.length === 1 ? "this style" : "these styles"} keep their current look but lose the
                        link to the style. Figma's undo (Cmd/Ctrl+Z) right afterwards reverts the whole apply.
                    </AlertDialog.Description>
                    <AlertDialog.Actions>
                        <AlertDialog.Cancel>
                            <Button variant="secondary">Cancel</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action onClick={onApply}>
                            <Button variant="destructive">Apply and delete</Button>
                        </AlertDialog.Action>
                    </AlertDialog.Actions>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </Flex>
    );
};
