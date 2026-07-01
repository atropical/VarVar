import { useState, useEffect } from "react";
import JSZip from "jszip";
import { OutputFormats, ExportFile } from "../types.d";

interface UseExportDataProps {
    format: OutputFormats;
    useRowColumnPos?: boolean;
    useTailwindFormat?: boolean;
}

interface UseExportDataReturn {
    filename: string;
    setFilename: (filename: string) => void;
    seeOutput: boolean;
    setSeeOutput: (seeOutput: boolean) => void;
    useRowColumnPos: boolean;
    setUseRowColumnPos: (useRowColumnPos: boolean) => void;
    useTailwindFormat: boolean;
    setUseTailwindFormat: (useTailwindFormat: boolean) => void;
    exportedData: string;
    setExportedData: (data: string) => void;
    exportedFiles: ExportFile[] | null;
    usedExtendedCollections: boolean;
    variablesCount: number;
    handleExport: () => void;
    handleSelectToCopy: () => void;
    handleDownload: () => void;
}

/**
 * Custom hook that consolidates shared export logic across all export views
 * @param format - The format of the exported data
 * @param useRowColumnPos - Whether to use row and column positions for linked variables
 * @returns An object containing the filename, seeOutput, useRowColumnPos, exportedData, variablesCount, handleExport, handleSelectToCopy, and handleDownload
 */
export const useExportData = ({ 
    format, 
    useRowColumnPos: initialUseRowColumnPos = false,
    useTailwindFormat: initialUseTailwindFormat = false
}: UseExportDataProps): UseExportDataReturn => {
    const [filename, setFilename] = useState<string>("exported_variables");
    const [seeOutput, setSeeOutput] = useState<boolean>(true);
    const [useRowColumnPos, setUseRowColumnPos] = useState<boolean>(initialUseRowColumnPos);
    const [useTailwindFormat, setUseTailwindFormat] = useState<boolean>(initialUseTailwindFormat);
    const [exportedData, setExportedData] = useState<string>("");
    const [exportedFiles, setExportedFiles] = useState<ExportFile[] | null>(null);
    const [usedExtendedCollections, setUsedExtendedCollections] = useState<boolean>(false);
    const [variablesCount, setVariablesCount] = useState<number>(0);

    const handleExport = () => {
        parent.postMessage({ 
            pluginMessage: { 
                type: "EXPORT.SUCCESS" as any, 
                format, 
                useLinkedVarRowAndColPos: format === OutputFormats.CSV ? useRowColumnPos : false,
                useTailwindFormat: format === OutputFormats.CSS ? useTailwindFormat : false
            } 
        }, "*");
    };

    const handleSelectToCopy = () => {
        if (exportedData) {
            const textArea = document.querySelector('#varvar-exported-output');
            const selection = document.getSelection();
            if (textArea && selection) {
                selection.selectAllChildren(textArea);
            } else {
                console.warn('Unable to select all code.');
            }
        }
    };

    const downloadFile = (data: string, fileFormat: string, fileName: string) => {
        const blob = new Blob([data], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileName}.${fileFormat}`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const downloadZip = async (files: ExportFile[], fileName: string) => {
        const zip = new JSZip();
        files.forEach((file) => {
            zip.file(`${file.filename}.json`, file.content);
        });
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileName}.zip`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDownload = () => {
        if (exportedFiles && exportedFiles.length > 1) {
            downloadZip(exportedFiles, filename);
        } else if (exportedData) {
            downloadFile(exportedData, format, filename);
        }
    };

    useEffect(() => {
        window.onmessage = ({ data: { pluginMessage } }) => {
            if (pluginMessage.type === "INFO.BASIC_INFO") {
                setVariablesCount(pluginMessage.count);
                const defaultFilename = `${pluginMessage.filename}_variables`;
                setFilename(defaultFilename);
            } else if (pluginMessage.type === "EXPORT.SUCCESS.RESULT") {
                const multiFile = pluginMessage.files && pluginMessage.files.length > 1;

                if (multiFile) {
                    setExportedFiles(pluginMessage.files);
                    setExportedData(pluginMessage.files[0].content);
                } else {
                    setExportedFiles(null);
                    setExportedData(pluginMessage.data || '');
                }
                setUsedExtendedCollections(!!pluginMessage.usedExtendedCollections);

                // Only auto-download if preview is disabled
                if (!seeOutput) {
                    if (multiFile) {
                        downloadZip(pluginMessage.files, filename);
                    } else {
                        downloadFile(pluginMessage.data, pluginMessage.format, filename);
                    }
                }
            }
        };
    }, [filename, format, seeOutput]);

    // Re-export when Tailwind format changes (for CSS format only)
    useEffect(() => {
        if (format === OutputFormats.CSS && exportedData) {
            // Trigger re-export when Tailwind format toggle changes
            parent.postMessage({ 
                pluginMessage: { 
                    type: "EXPORT.SUCCESS" as any, 
                    format, 
                    useLinkedVarRowAndColPos: false,
                    useTailwindFormat: useTailwindFormat
                } 
            }, "*");
        }
    }, [useTailwindFormat, format]);

    // Re-export when row/column position changes (for CSV format only)
    useEffect(() => {
        if (format === OutputFormats.CSV && exportedData) {
            // Trigger re-export when row/column position toggle changes
            parent.postMessage({ 
                pluginMessage: { 
                    type: "EXPORT.SUCCESS" as any, 
                    format, 
                    useLinkedVarRowAndColPos: useRowColumnPos,
                    useTailwindFormat: false
                } 
            }, "*");
        }
    }, [useRowColumnPos, format]);

    // Request basic info on mount (only if not already received)
    useEffect(() => {
        if (variablesCount === 0) {
            parent.postMessage({ pluginMessage: { type: "INFO.GET_BASIC_INFO" as any } }, "*");
        }
    }, [variablesCount]);

    return {
        filename,
        setFilename,
        seeOutput,
        setSeeOutput,
        useRowColumnPos,
        setUseRowColumnPos,
        useTailwindFormat,
        setUseTailwindFormat,
        exportedData,
        setExportedData,
        exportedFiles,
        usedExtendedCollections,
        variablesCount,
        handleExport,
        handleSelectToCopy,
        handleDownload
    };
};
