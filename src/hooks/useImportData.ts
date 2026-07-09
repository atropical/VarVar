import { useState, useEffect } from "react";
import { MessageTypes, ImportSummary, ImportMode } from "../types.d";

interface UseImportDataReturn {
    fileNames: string[];
    fileContents: string[];
    setFiles: (fileNames: string[], fileContents: string[]) => void;
    importMode: ImportMode;
    setImportMode: (importMode: ImportMode) => void;
    confirmDialogOpen: boolean;
    setConfirmDialogOpen: (open: boolean) => void;
    isImporting: boolean;
    importSummary: ImportSummary | null;
    importError: string | null;
    handleImportClick: () => void;
    handleConfirmReplace: () => void;
}

/**
 * Custom hook that owns the import view's state and all postMessage traffic
 * for the import flow, mirroring useExportData's structure for the reverse
 * direction.
 */
export const useImportData = (): UseImportDataReturn => {
    const [fileNames, setFileNames] = useState<string[]>([]);
    const [fileContents, setFileContents] = useState<string[]>([]);
    const [importMode, setImportMode] = useState<ImportMode>(ImportMode.MERGE);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState<boolean>(false);
    const [isImporting, setIsImporting] = useState<boolean>(false);
    const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    const setFiles = (names: string[], contents: string[]) => {
        setFileNames(names);
        setFileContents(contents);
        setImportSummary(null);
        setImportError(null);
    };

    const sendImportRequest = () => {
        setIsImporting(true);
        setImportSummary(null);
        setImportError(null);
        parent.postMessage({
            pluginMessage: {
                type: MessageTypes.IMPORT_REQUEST,
                importFiles: fileContents,
                importMode
            }
        }, "*");
    };

    const handleImportClick = () => {
        if (fileContents.length === 0) return;

        // Only Sync and Clean ever delete anything — Merge and Update only
        // don't need a confirmation gate.
        if (importMode === ImportMode.SYNC || importMode === ImportMode.CLEAN) {
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
            if (pluginMessage.type === MessageTypes.IMPORT_SUCCESS_RESULT) {
                setIsImporting(false);
                setImportSummary(pluginMessage.importSummary);
            } else if (pluginMessage.type === MessageTypes.IMPORT_ERROR) {
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
        isImporting,
        importSummary,
        importError,
        handleImportClick,
        handleConfirmReplace
    };
};
