import { useState, useEffect } from "react";
import { MessageTypes, ImportSummary, ImportDiff, ImportMode } from "../types.d";

interface UseImportDataReturn {
    fileNames: string[];
    fileContents: string[];
    setFiles: (fileNames: string[], fileContents: string[]) => void;
    importMode: ImportMode;
    setImportMode: (importMode: ImportMode) => void;
    confirmDialogOpen: boolean;
    setConfirmDialogOpen: (open: boolean) => void;
    isPreviewing: boolean;
    previewDiff: ImportDiff | null;
    previewSummary: ImportSummary | null;
    previewedImportMode: ImportMode | null;
    isImporting: boolean;
    importSummary: ImportSummary | null;
    importError: string | null;
    handlePreviewClick: () => void;
    handleDiscardPreview: () => void;
    handleConfirmImportClick: () => void;
    handleConfirmReplace: () => void;
}

/**
 * Custom hook that owns the import view's state and all postMessage traffic
 * for the import flow: pick file(s) → preview a dry-run diff (no document
 * changes) → confirm to actually apply it. Mirrors useExportData's
 * structure for the reverse direction.
 */
export const useImportData = (): UseImportDataReturn => {
    const [fileNames, setFileNames] = useState<string[]>([]);
    const [fileContents, setFileContents] = useState<string[]>([]);
    const [importMode, setImportMode] = useState<ImportMode>(ImportMode.MERGE);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState<boolean>(false);
    const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
    const [previewDiff, setPreviewDiff] = useState<ImportDiff | null>(null);
    const [previewSummary, setPreviewSummary] = useState<ImportSummary | null>(null);
    // The importMode a pending/shown preview was computed for — locked in at
    // preview time so that switching the radio group afterwards (without
    // discarding the preview first) can never send a real import under a
    // different, unreviewed mode than the diff the user actually looked at.
    const [previewedImportMode, setPreviewedImportMode] = useState<ImportMode | null>(null);
    const [isImporting, setIsImporting] = useState<boolean>(false);
    const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    const setFiles = (names: string[], contents: string[]) => {
        setFileNames(names);
        setFileContents(contents);
        setPreviewDiff(null);
        setPreviewSummary(null);
        setPreviewedImportMode(null);
        setImportSummary(null);
        setImportError(null);
    };

    const handlePreviewClick = () => {
        if (fileContents.length === 0) return;

        setIsPreviewing(true);
        setPreviewDiff(null);
        setPreviewSummary(null);
        setPreviewedImportMode(importMode);
        setImportSummary(null);
        setImportError(null);
        parent.postMessage({
            pluginMessage: {
                type: MessageTypes.IMPORT_PREVIEW_REQUEST,
                importFiles: fileContents,
                importMode
            }
        }, "*");
    };

    const handleDiscardPreview = () => {
        setPreviewDiff(null);
        setPreviewSummary(null);
        setPreviewedImportMode(null);
    };

    const sendImportRequest = () => {
        // Always the mode the shown preview was computed for, never the live
        // radio-group value — see the comment on previewedImportMode above.
        const modeToApply = previewedImportMode ?? importMode;
        setIsImporting(true);
        setImportError(null);
        parent.postMessage({
            pluginMessage: {
                type: MessageTypes.IMPORT_REQUEST,
                importFiles: fileContents,
                importMode: modeToApply
            }
        }, "*");
    };

    const handleConfirmImportClick = () => {
        if (fileContents.length === 0) return;

        const modeToApply = previewedImportMode ?? importMode;
        // Only Sync and Clean ever delete anything — Merge and Update only
        // don't need a confirmation gate.
        if (modeToApply === ImportMode.SYNC || modeToApply === ImportMode.CLEAN) {
            setConfirmDialogOpen(true);
        } else {
            sendImportRequest();
        }
    };

    const handleConfirmReplace = () => {
        setConfirmDialogOpen(false);
        sendImportRequest();
    };

    useEffect(() => {
        window.onmessage = ({ data: { pluginMessage } }) => {
            if (pluginMessage.type === MessageTypes.IMPORT_PREVIEW_RESULT) {
                setIsPreviewing(false);
                setPreviewSummary(pluginMessage.importSummary);
                setPreviewDiff(pluginMessage.importDiff);
            } else if (pluginMessage.type === MessageTypes.IMPORT_SUCCESS_RESULT) {
                setIsImporting(false);
                setImportSummary(pluginMessage.importSummary);
                setPreviewDiff(null);
                setPreviewSummary(null);
                setPreviewedImportMode(null);
            } else if (pluginMessage.type === MessageTypes.IMPORT_ERROR) {
                setIsPreviewing(false);
                setIsImporting(false);
                setImportError(pluginMessage.error || "Unknown error occurred");
            }
        };
    }, []);

    return {
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
    };
};
