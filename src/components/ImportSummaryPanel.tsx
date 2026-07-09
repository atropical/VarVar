import React from "react";
import { Flex, Text } from "figma-kit";
import type { ImportSummary } from "../types.d";

interface ImportSummaryPanelProps {
    summary: ImportSummary;
    editorType?: string;
}

/**
 * Displays the result of an import run: what was created/reused/updated,
 * and any non-fatal warnings (unresolved aliases, `_unlinked` entries, etc.).
 * Mirrors OutputPreview's panel styling so import and export views share the
 * same right-hand-side "report" layout.
 */
export const ImportSummaryPanel: React.FC<ImportSummaryPanelProps> = ({ summary, editorType = 'dev' }) => {
    return (
        <Flex direction="column" gap="2" style={{ flex: "2 0 300px", maxWidth: editorType === 'design' ? "454px" : undefined }}>
            <Text>Import Summary</Text>

            <Flex
                direction="column"
                gap="2"
                style={{
                    border: 'var(--figma-color-border)',
                    borderRadius: 4,
                    padding: 8,
                    backgroundColor: 'rgba(0,0,0,.25)',
                }}
            >
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Collections: {summary.collectionsCreated} created, {summary.collectionsReused} reused
                    {summary.collectionsDeleted > 0 && `, ${summary.collectionsDeleted} deleted`}
                </Text>
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Modes: {summary.modesCreated} created
                    {summary.modesDeleted > 0 && `, ${summary.modesDeleted} deleted`}
                </Text>
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Variables: {summary.variablesCreated} created, {summary.variablesUpdated} updated
                    {summary.variablesDeleted > 0 && `, ${summary.variablesDeleted} deleted`}
                </Text>
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Values set: {summary.valuesSet} ({summary.aliasesResolved} linked variables)
                </Text>
            </Flex>

            {summary.warnings.length > 0 && (
                <details style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    backgroundColor: "rgba(234, 179, 8, 0.15)",
                    color: 'var(--figma-color-text)',
                }}>
                    <summary style={{ cursor: 'pointer' }}>
                        <Text weight="strong" style={{ display: 'inline' }}>
                            Summary: {summary.warnings.length} warning{summary.warnings.length === 1 ? '' : 's'}
                        </Text>
                    </summary>
                    <Flex direction="column" gap="1" style={{ marginTop: '0.5rem' }}>
                        <Text weight="strong">Detail</Text>
                        {summary.warnings.map((warning, index) => (
                            <Text key={index}>{warning}</Text>
                        ))}
                    </Flex>
                </details>
            )}
        </Flex>
    );
};
