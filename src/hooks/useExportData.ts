import { useState, useEffect } from "react";
import JSZip from "jszip";
import { OutputFormats, ExportFile } from "../types.d";
import type { ExportUnit } from "../types.d";
import { DEFAULT_EXPORT_UNIT, DEFAULT_ROOT_FONT_SIZE, normalizeRootFontSize } from "../utils/units";

interface UseExportDataProps {
    format: OutputFormats;
    useRowColumnPos?: boolean;
    useTailwindFormat?: boolean;
    useSingleDashSeparator?: boolean;
    useCodeSyntaxName?: boolean;
    exportUnit?: ExportUnit;
    rootFontSize?: string;
    appendPxToUnscoped?: boolean;
    dtcgCompliantValues?: boolean;
    useLegacyFormat?: boolean;
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
    useSingleDashSeparator: boolean;
    setUseSingleDashSeparator: (useSingleDashSeparator: boolean) => void;
    useCodeSyntaxName: boolean;
    setUseCodeSyntaxName: (useCodeSyntaxName: boolean) => void;
    exportUnit: ExportUnit;
    setExportUnit: (exportUnit: ExportUnit) => void;
    rootFontSize: string;
    setRootFontSize: (rootFontSize: string) => void;
    appendPxToUnscoped: boolean;
    setAppendPxToUnscoped: (appendPxToUnscoped: boolean) => void;
    dtcgCompliantValues: boolean;
    setDtcgCompliantValues: (dtcgCompliantValues: boolean) => void;
    useLegacyFormat: boolean;
    setUseLegacyFormat: (useLegacyFormat: boolean) => void;
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
    useTailwindFormat: initialUseTailwindFormat = false,
    useSingleDashSeparator: initialUseSingleDashSeparator = true,
    useCodeSyntaxName: initialUseCodeSyntaxName = false,
    exportUnit: initialExportUnit = DEFAULT_EXPORT_UNIT,
    rootFontSize: initialRootFontSize = String(DEFAULT_ROOT_FONT_SIZE),
    appendPxToUnscoped: initialAppendPxToUnscoped = false,
    dtcgCompliantValues: initialDtcgCompliantValues = true,
    useLegacyFormat: initialUseLegacyFormat = false
}: UseExportDataProps): UseExportDataReturn => {
    const [filename, setFilename] = useState<string>("exported_variables");
    const [seeOutput, setSeeOutput] = useState<boolean>(true);
    const [useRowColumnPos, setUseRowColumnPos] = useState<boolean>(initialUseRowColumnPos);
    const [useTailwindFormat, setUseTailwindFormat] = useState<boolean>(initialUseTailwindFormat);
    // The group separator is offered for both CSS outputs, but their defaults differ:
    // Tailwind needs single dashes for IntelliSense to suggest the variable, while
    // plain CSS has always joined groups with `--`. Until the user touches the switch
    // it simply follows the Tailwind toggle; from then on their choice sticks.
    const [singleDashSeparatorChoice, setSingleDashSeparatorChoice] = useState<boolean>(initialUseSingleDashSeparator);
    const [singleDashSeparatorTouched, setSingleDashSeparatorTouched] = useState<boolean>(false);
    // The Web code syntax can only stand in for a variable name in the formats
    // that emit one, so it's ignored (and never sent) for JSON/CSV.
    const [useCodeSyntaxName, setUseCodeSyntaxName] = useState<boolean>(initialUseCodeSyntaxName);
    const [exportUnit, setExportUnit] = useState<ExportUnit>(initialExportUnit);
    // Kept as a string so the field can be cleared while typing; every consumer
    // normalizes it, so an empty or nonsensical entry falls back to 16.
    const [rootFontSize, setRootFontSize] = useState<string>(initialRootFontSize);
    // Whether variables left on Figma's default scoping count as dimensions and
    // get the unit too. Off by default, as it shipped in 4.4: nothing about those
    // variables says they are lengths.
    const [appendPxToUnscoped, setAppendPxToUnscoped] = useState<boolean>(initialAppendPxToUnscoped);
    // JSON only: emit dimensions as the DTCG `{ value, unit }` object rather than
    // the "16px" string earlier versions emitted. On by default.
    const [dtcgCompliantValues, setDtcgCompliantValues] = useState<boolean>(initialDtcgCompliantValues);
    const [useLegacyFormat, setUseLegacyFormat] = useState<boolean>(initialUseLegacyFormat);
    const [exportedData, setExportedData] = useState<string>("");
    const [exportedFiles, setExportedFiles] = useState<ExportFile[] | null>(null);
    const [usedExtendedCollections, setUsedExtendedCollections] = useState<boolean>(false);
    const [variablesCount, setVariablesCount] = useState<number>(0);

    const supportsLegacyFormat = format === OutputFormats.JSON
        || format === OutputFormats.CSV
        || format === OutputFormats.JS;

    const supportsCodeSyntaxName = format === OutputFormats.CSS
        || format === OutputFormats.JS;

    // CSV and JS stay unit-free: CSV's Value column is a spreadsheet cell that has
    // always held a bare number (and its Scopes column already says what the value
    // is for), and the JS output's values are real JavaScript literals that
    // consumers read as numbers — a unit would turn them into strings.
    const supportsUnitOption = format === OutputFormats.CSS
        || format === OutputFormats.JSON;

    const useSingleDashSeparator = singleDashSeparatorTouched
        ? singleDashSeparatorChoice
        : useTailwindFormat;

    const setUseSingleDashSeparator = (value: boolean) => {
        setSingleDashSeparatorTouched(true);
        setSingleDashSeparatorChoice(value);
    };

    /**
     * The unit-related half of an export message. Shared by every re-export
     * trigger so a new option can't be sent by one path and forgotten by
     * another. Formats that emit no unit send the defaults, which the exporters
     * ignore anyway.
     */
    const unitPayload = () => ({
        exportUnit: supportsUnitOption ? exportUnit : DEFAULT_EXPORT_UNIT,
        rootFontSize: normalizeRootFontSize(rootFontSize),
        appendPxToUnscoped: supportsUnitOption ? appendPxToUnscoped : false,
        dtcgCompliantValues: format === OutputFormats.JSON ? dtcgCompliantValues : true
    });

    const handleExport = () => {
        parent.postMessage({
            pluginMessage: {
                type: "EXPORT.SUCCESS" as any,
                format,
                useLinkedVarRowAndColPos: format === OutputFormats.CSV ? useRowColumnPos : false,
                useTailwindFormat: format === OutputFormats.CSS ? useTailwindFormat : false,
                useSingleDashSeparator: format === OutputFormats.CSS ? useSingleDashSeparator : false,
                useCodeSyntaxName: supportsCodeSyntaxName ? useCodeSyntaxName : false,
                ...unitPayload(),
                useLegacyFormat: supportsLegacyFormat ? useLegacyFormat : false
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

    // Re-export when Tailwind format or the group separator changes (for CSS format only)
    useEffect(() => {
        if (format === OutputFormats.CSS && exportedData) {
            // Trigger re-export when Tailwind format toggle changes
            parent.postMessage({ 
                pluginMessage: { 
                    type: "EXPORT.SUCCESS" as any, 
                    format, 
                    useLinkedVarRowAndColPos: false,
                    useTailwindFormat: useTailwindFormat,
                    useSingleDashSeparator,
                    useCodeSyntaxName,
                    ...unitPayload()
                } 
            }, "*");
        }
    }, [useTailwindFormat, useSingleDashSeparator, format]);

    // Re-export when any of the value-shaping options change (CSS and JSON)
    useEffect(() => {
        if (supportsUnitOption && exportedData) {
            parent.postMessage({
                pluginMessage: {
                    type: "EXPORT.SUCCESS" as any,
                    format,
                    useLinkedVarRowAndColPos: false,
                    useTailwindFormat: format === OutputFormats.CSS ? useTailwindFormat : false,
                    useSingleDashSeparator: format === OutputFormats.CSS ? useSingleDashSeparator : false,
                    useCodeSyntaxName: supportsCodeSyntaxName ? useCodeSyntaxName : false,
                    ...unitPayload(),
                    useLegacyFormat: supportsLegacyFormat ? useLegacyFormat : false
                }
            }, "*");
        }
    }, [exportUnit, rootFontSize, appendPxToUnscoped, dtcgCompliantValues, format]);

    // Re-export when the code-syntax naming toggle changes (CSS and JS formats only)
    useEffect(() => {
        if (supportsCodeSyntaxName && exportedData) {
            parent.postMessage({
                pluginMessage: {
                    type: "EXPORT.SUCCESS" as any,
                    format,
                    useLinkedVarRowAndColPos: false,
                    useTailwindFormat: format === OutputFormats.CSS ? useTailwindFormat : false,
                    useSingleDashSeparator: format === OutputFormats.CSS ? useSingleDashSeparator : false,
                    useCodeSyntaxName,
                    ...unitPayload(),
                    useLegacyFormat: supportsLegacyFormat ? useLegacyFormat : false
                }
            }, "*");
        }
    }, [useCodeSyntaxName, format]);

    // Re-export when row/column position changes (for CSV format only)
    useEffect(() => {
        if (format === OutputFormats.CSV && exportedData) {
            // Trigger re-export when row/column position toggle changes
            parent.postMessage({
                pluginMessage: {
                    type: "EXPORT.SUCCESS" as any,
                    format,
                    useLinkedVarRowAndColPos: useRowColumnPos,
                    useTailwindFormat: false,
                    useLegacyFormat
                }
            }, "*");
        }
    }, [useRowColumnPos, format]);

    // Re-export when legacy format changes (for JSON/CSV/JS formats)
    useEffect(() => {
        if (supportsLegacyFormat && exportedData) {
            // Trigger re-export when legacy format toggle changes
            parent.postMessage({
                pluginMessage: {
                    type: "EXPORT.SUCCESS" as any,
                    format,
                    useLinkedVarRowAndColPos: format === OutputFormats.CSV ? useRowColumnPos : false,
                    useTailwindFormat: false,
                    useCodeSyntaxName: supportsCodeSyntaxName ? useCodeSyntaxName : false,
                    ...unitPayload(),
                    useLegacyFormat
                }
            }, "*");
        }
    }, [useLegacyFormat, format]);

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
        useSingleDashSeparator,
        setUseSingleDashSeparator,
        useCodeSyntaxName,
        setUseCodeSyntaxName,
        exportUnit,
        setExportUnit,
        rootFontSize,
        setRootFontSize,
        appendPxToUnscoped,
        setAppendPxToUnscoped,
        dtcgCompliantValues,
        setDtcgCompliantValues,
        useLegacyFormat,
        setUseLegacyFormat,
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
