import React from "react";
import { Flex, Text, Button } from "figma-kit";
import { PluginDialogShell } from "../components/PluginDialogShell";
import { ExportLayout } from "../components/ExportLayout";
import { FileImportInput } from "../components/FileImportInput";
import { ImportOptions } from "../components/ImportOptions";
import { ConfirmReplaceDialog } from "../components/ConfirmReplaceDialog";
import { ImportSummaryPanel } from "../components/ImportSummaryPanel";
import { ImportDiffPreview } from "../components/ImportDiffPreview";
import { useImportData } from "../hooks/useImportData";

interface ImportJSONProps {
    editorType?: string;
}

/**
 * JSON import view: pick a previously-exported VarVar JSON file (or files),
 * choose how to reconcile against existing variables (merge, merge + prune,
 * or clean), preview a dry-run diff of exactly what would change, and only
 * then confirm to recreate collections, modes, variables and linked-variable
 * references in the document.
 */
export const ImportJSON: React.FC<ImportJSONProps> = ({ editorType = "" }) => {
    const {
        fileNames,
        fileContents,
        setFiles,
        importMode,
        setImportMode,
        confirmDialogOpen,
        setConfirmDialogOpen,
        isPreviewing,
        previewDiff,
        previewSummary,
        previewedImportMode,
        isImporting,
        importSummary,
        importError,
        handlePreviewClick,
        handleDiscardPreview,
        handleConfirmImportClick,
        handleConfirmReplace
    } = useImportData();

    const formControls = (
        <>
            <Flex direction="column" gap="2">
                <Text size="large" weight="strong">Import from JSON</Text>
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Import a JSON file previously exported by VarVar (current or legacy
                    format) to recreate collections, modes, variables and linked
                    variables. CSV, CSS and JS files aren't supported for import.
                </Text>
            </Flex>

            <FileImportInput fileNames={fileNames} onFilesSelected={setFiles} />

            <ImportOptions
                importMode={importMode}
                onImportModeChange={setImportMode}
                disabled={previewDiff !== null}
            />

            {previewDiff ? (
                <Flex direction="column" gap="2">
                    <Button
                        variant="primary"
                        fullWidth={true}
                        size="medium"
                        disabled={isImporting}
                        onClick={handleConfirmImportClick}
                    >
                        {isImporting ? "Importing…" : "Confirm import"}
                    </Button>
                    <Button
                        variant="secondary"
                        fullWidth={true}
                        size="medium"
                        disabled={isImporting}
                        onClick={handleDiscardPreview}
                    >
                        Change
                    </Button>
                </Flex>
            ) : (
                <Button
                    variant="primary"
                    fullWidth={true}
                    size="medium"
                    disabled={fileContents.length === 0 || isPreviewing}
                    onClick={handlePreviewClick}
                >
                    {isPreviewing ? "Computing preview…" : "Preview import"}
                </Button>
            )}

            {importError && (
                <Flex style={{
                    padding: "0.5rem",
                    border: "1px solid var(--figma-color-border-danger-strong)",
                    borderRadius: "4px",
                    backgroundColor: "var(--figma-color-bg-danger)",
                }}>
                    <Text style={{ color: 'var(--figma-color-text-ondanger)' }}>
                        {importError}
                    </Text>
                </Flex>
            )}
        </>
    );

    const preview = importSummary ? (
        <ImportSummaryPanel summary={importSummary} editorType={editorType} />
    ) : previewDiff && previewSummary ? (
        <ImportDiffPreview
            diff={previewDiff}
            summary={previewSummary}
            editorType={editorType}
        />
    ) : null;

    return (
        <PluginDialogShell>
            <ExportLayout
                editorType={editorType}
                children={formControls}
                preview={preview}
            />

            <ConfirmReplaceDialog
                open={confirmDialogOpen}
                mode={previewedImportMode ?? importMode}
                onOpenChange={setConfirmDialogOpen}
                onConfirm={handleConfirmReplace}
            />
        </PluginDialogShell>
    );
};
