import React, { useMemo, useState } from "react";
import { Flex, Text } from "figma-kit";
import type { ImportDiff, ImportDiffVariable, ImportSummary } from "../types.d";

interface ImportDiffPreviewProps {
    diff: ImportDiff;
    summary: ImportSummary;
    editorType?: string;
}

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
    create: { bg: "rgba(34, 197, 94, 0.15)", text: "var(--figma-color-text-success, #22c55e)" },
    update: { bg: "rgba(59, 130, 246, 0.15)", text: "var(--figma-color-text-brand, #3b82f6)" },
    delete: { bg: "rgba(239, 68, 68, 0.15)", text: "var(--figma-color-text-danger, #ef4444)" },
    reuse: { bg: "rgba(148, 163, 184, 0.15)", text: "var(--figma-color-text-secondary)" },
    unchanged: { bg: "rgba(148, 163, 184, 0.15)", text: "var(--figma-color-text-secondary)" },
};

const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
    const colors = ACTION_COLORS[action] ?? ACTION_COLORS.reuse;
    return (
        <Text
            style={{
                display: "inline-block",
                padding: "0 6px",
                borderRadius: 3,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                backgroundColor: colors.bg,
                color: colors.text,
            }}
        >
            {action}
        </Text>
    );
};

type VariableAction = ImportDiffVariable["action"];
const VARIABLE_ACTIONS: VariableAction[] = ["create", "update", "delete", "unchanged"];
// "unchanged" (matched but nothing actually differs) is deselected by
// default — it's usually the least interesting row in a big diff.
const DEFAULT_SELECTED_ACTIONS = new Set<VariableAction>(["create", "update", "delete"]);

const FilterChip: React.FC<{ label: string; count: number; active: boolean; onToggle: () => void }> = ({ label, count, active, onToggle }) => {
    const colors = ACTION_COLORS[label] ?? ACTION_COLORS.reuse;
    return (
        <Text
            onClick={onToggle}
            style={{
                cursor: "pointer",
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 11,
                textTransform: "capitalize",
                backgroundColor: active ? colors.bg : "transparent",
                color: active ? colors.text : "var(--figma-color-text-secondary)",
                border: `1px solid ${active ? "transparent" : "var(--figma-color-border)"}`,
                userSelect: "none",
            }}
        >
            {label} ({count})
        </Text>
    );
};

/**
 * Shows the itemized dry-run diff computed by `previewImport` — nothing in
 * the document has changed yet. The user reviews collection/mode/variable
 * creates, updates and deletes (with per-mode before → after values); the
 * actual Confirm import / Change (discard preview) actions live in the
 * form controls column so there's a single, consistently-sized action area.
 */
export const ImportDiffPreview: React.FC<ImportDiffPreviewProps> = ({
    diff,
    summary,
    editorType = "dev",
}) => {
    const changedCollections = diff.collections.filter((c) => c.action !== "reuse");
    const hasStructuralChanges = changedCollections.length > 0 || diff.modes.length > 0 || diff.variables.length > 0;

    const [selectedActions, setSelectedActions] = useState<Set<VariableAction>>(new Set(DEFAULT_SELECTED_ACTIONS));
    const toggleAction = (action: VariableAction) => {
        setSelectedActions((prev) => {
            const next = new Set(prev);
            if (next.has(action)) next.delete(action); else next.add(action);
            return next;
        });
    };

    const actionCounts = useMemo(() => {
        const counts: Record<VariableAction, number> = { create: 0, update: 0, delete: 0, unchanged: 0 };
        for (const v of diff.variables) counts[v.action] += 1;
        return counts;
    }, [diff.variables]);

    const filteredVariables = useMemo(
        () => diff.variables.filter((v) => selectedActions.has(v.action)),
        [diff.variables, selectedActions]
    );

    return (
        <Flex direction="column" gap="2" style={{ flex: "2 0 300px", maxWidth: editorType === "design" ? "454px" : undefined }}>
            <Text size="large" weight="strong">Preview</Text>
            <Text style={{ color: "var(--figma-color-text-secondary)" }}>
                Nothing has been changed yet. Review what this import would do, then confirm to apply it.
            </Text>

            {!hasStructuralChanges && (
                <Text style={{ color: "var(--figma-color-text-secondary)" }}>
                    No changes — the document already matches the file.
                </Text>
            )}

            {diff.collections.length > 0 && (
                <Flex direction="column" gap="1">
                    <Text weight="strong">Collections</Text>
                    {diff.collections.map((c, i) => (
                        <Flex key={i} gap="2" align="center">
                            <ActionBadge action={c.action} />
                            <Text>{c.name}</Text>
                        </Flex>
                    ))}
                </Flex>
            )}

            {diff.modes.length > 0 && (
                <Flex direction="column" gap="1">
                    <Text weight="strong">Modes</Text>
                    {diff.modes.map((m, i) => (
                        <Flex key={i} gap="2" align="center">
                            <ActionBadge action={m.action} />
                            <Text>{m.collectionName} / {m.name}</Text>
                        </Flex>
                    ))}
                </Flex>
            )}

            {diff.variables.length > 0 && (
                <Flex direction="column" gap="2">
                    <Text weight="strong">Variables ({diff.variables.length})</Text>

                    <Flex gap="1" style={{ flexWrap: "wrap" }}>
                        {VARIABLE_ACTIONS.filter((action) => actionCounts[action] > 0).map((action) => (
                            <FilterChip
                                key={action}
                                label={action}
                                count={actionCounts[action]}
                                active={selectedActions.has(action)}
                                onToggle={() => toggleAction(action)}
                            />
                        ))}
                    </Flex>

                    {filteredVariables.length === 0 ? (
                        <Text style={{ color: "var(--figma-color-text-secondary)" }}>
                            No variables match the selected filters.
                        </Text>
                    ) : (
                        <Flex
                            direction="column"
                            gap="1"
                            style={{
                                maxHeight: 320,
                                overflowY: "auto",
                                border: "1px solid var(--figma-color-border)",
                                borderRadius: 4,
                                padding: 8,
                            }}
                        >
                            {filteredVariables.map((v, i) => (
                                <Flex key={i} direction="column" gap="1" style={{ paddingBottom: 6, borderBottom: i < filteredVariables.length - 1 ? "1px solid var(--figma-color-border)" : undefined }}>
                                    <Flex gap="2" align="center">
                                        <ActionBadge action={v.action} />
                                        <Text style={{ fontFamily: "monospace" }}>{v.collectionName} / {v.path}</Text>
                                    </Flex>
                                    {v.values.length > 0 && (
                                        <Flex direction="column" gap="1" style={{ marginLeft: 8 }}>
                                            {v.values.map((val, j) => (
                                                <Text
                                                    key={j}
                                                    style={{
                                                        color: val.changed ? undefined : "var(--figma-color-text-secondary)",
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    {val.modeName}: {val.before !== undefined ? `${val.before} → ` : ""}{val.after}
                                                </Text>
                                            ))}
                                        </Flex>
                                    )}
                                </Flex>
                            ))}
                        </Flex>
                    )}
                </Flex>
            )}

            {summary.warnings.length > 0 && (
                <details style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    backgroundColor: "rgba(234, 179, 8, 0.15)",
                    color: "var(--figma-color-text)",
                }}>
                    <summary style={{ cursor: "pointer" }}>
                        <Text weight="strong" style={{ display: "inline" }}>
                            {summary.warnings.length} warning{summary.warnings.length === 1 ? "" : "s"}
                        </Text>
                    </summary>
                    <Flex direction="column" gap="1" style={{ marginTop: "0.5rem" }}>
                        {summary.warnings.map((warning, index) => (
                            <Text key={index}>{warning}</Text>
                        ))}
                    </Flex>
                </details>
            )}
        </Flex>
    );
};
