import React from "react";
import { Flex, Text, Button } from "figma-kit";
import { PluginDialogShell } from "../components/PluginDialogShell";
import { ExportLayout } from "../components/ExportLayout";
import { FileImportInput } from "../components/FileImportInput";
import { ImportOptions } from "../components/ImportOptions";
import { ConfirmReplaceDialog } from "../components/ConfirmReplaceDialog";
import { ImportSummaryPanel } from "../components/ImportSummaryPanel";
import { useImportData } from "../hooks/useImportData";

interface ImportJSONProps {
    editorType?: string;
}

/**
 * JSON import view: pick a previously-exported VarVar JSON file (or files),
 * optionally replace all existing variables, and recreate collections,
 * modes, variables and linked-variable references in the document.
 */
export const ImportJSON: React.FC<ImportJSONProps> = ({ editorType = "" }) => {
    const {
        fileNames,
        fileContents,
        setFiles,
        replaceExisting,
        setReplaceExisting,
        confirmDialogOpen,
        setConfirmDialogOpen,
        isImporting,
        importSummary,
        importError,
        handleImportClick,
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
                replaceExisting={replaceExisting}
                onReplaceExistingChange={setReplaceExisting}
            />

            <Button
                variant="primary"
                fullWidth={true}
                size="medium"
                disabled={fileContents.length === 0 || isImporting}
                onClick={handleImportClick}
            >
                {isImporting ? "Importing…" : "Import Variables"}
            </Button>

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
                onOpenChange={setConfirmDialogOpen}
                onConfirm={handleConfirmReplace}
            />
        </PluginDialogShell>
    );
};
