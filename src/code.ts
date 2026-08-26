/// <reference types="@figma/plugin-typings" />

import { exportToCSV } from "./utils/collectionToCSV";
import { exportToJSON } from "./utils/collectionToJSON";
import { exportToCSS } from "./utils/collectionToCSS";
import { exportToTailwind } from "./utils/collectionToTailwind";
import { exportToJS } from "./utils/collectionToJS";
import { toLegacyJSON } from "./utils/legacyJsonConverter";
import { toLegacyCSV } from "./utils/legacyCsvConverter";
import { toLegacyJS } from "./utils/legacyJsConverter";
import { importVariables, previewImport } from "./utils/importJSON";
import { OutputFormats, MessageTypes, PluginCommands, PluginMessage, ExportFile, ImportMode } from "./types.d";
import type { ExportUnit } from "./types.d";
import { DEFAULT_EXPORT_UNIT, DEFAULT_ROOT_FONT_SIZE } from "./utils/units";

figma.showUI(__html__, { width: 800, height: 500, themeColors: true });

/**
 * Handle plugin menu commands
 */
figma.on('run', ({ command }) => {
    // Send the command to UI immediately when plugin starts
    figma.ui.postMessage({
        type: MessageTypes.BASIC_INFO,
        command: command as PluginCommands,
        count: 0,
        filename: figma.root.name,
        editorType: figma.editorType || 'figma' // fallback to 'figma' if undefined
    } as PluginMessage);
});

/**
 * Handles the basic info request from UI
 */
async function handleBasicInfo(command?: PluginCommands) {
    const vars = await figma.variables.getLocalVariablesAsync();
    const filename = figma.root.name;
    
    figma.ui.postMessage({
        type: MessageTypes.BASIC_INFO,
        command,
        count: vars.length,
        filename,
        editorType: figma.editorType || 'figma' // fallback to 'figma' if undefined
    } as PluginMessage);
}

/**
 * Handles export requests with format-specific logic
 */
async function handleExport(format: OutputFormats, useLinkedVarRowAndColPos: boolean = false, useTailwindFormat: boolean = false, useLegacyFormat: boolean = false, useSingleDashSeparator: boolean = false, useCodeSyntaxName: boolean = false, exportUnit: ExportUnit = DEFAULT_EXPORT_UNIT, rootFontSize: number = DEFAULT_ROOT_FONT_SIZE, appendPxToUnscoped: boolean = false, dtcgCompliantValues: boolean = true) {
    try {
        let data: string | undefined;
        let files: ExportFile[] | undefined;

        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        // The legacy (v2.x) JSON shape predates units entirely: every numeric value
        // is a bare number there, so the unit has to be left off at the source on
        // that path (toLegacyJSON also unwraps a unit-carrying value defensively).
        const dtcgExportUnit: ExportUnit = useLegacyFormat ? "none" : exportUnit;
        // exportToTailwind doesn't have hierarchy-aware handling yet, so the
        // flag stays false on that path even if extended collections exist.
        // Legacy format (JSON/CSV) flattens extended collections into one file,
        // so it shouldn't surface the "extended collections" preview note either.
        const usedExtendedCollections = !(format === OutputFormats.CSS && useTailwindFormat)
            && !(format === OutputFormats.JSON && useLegacyFormat)
            && !(format === OutputFormats.CSV && useLegacyFormat)
            && collections.some((collection) => collection.isExtension);

        switch (format) {
            case OutputFormats.CSV: {
                const csv = await exportToCSV(useLinkedVarRowAndColPos) || '';
                data = useLegacyFormat ? toLegacyCSV(csv) : csv;
                break;
            }
            case OutputFormats.JSON: {
                const jsonFiles = await exportToJSON(dtcgExportUnit, rootFontSize, appendPxToUnscoped, dtcgCompliantValues) || [];
                const outputFiles = useLegacyFormat ? toLegacyJSON(jsonFiles) : jsonFiles;
                if (outputFiles.length <= 1) {
                    data = outputFiles[0] ? outputFiles[0].content : '';
                } else {
                    files = outputFiles;
                }
                break;
            }
            case OutputFormats.JS: {
                // JS never carries units: its values are real JS literals that
                // consumers read as numbers, so dimensions stay bare numbers.
                const js = await exportToJS(useCodeSyntaxName) || '';
                data = useLegacyFormat ? toLegacyJS(js) : js;
                break;
            }
            case OutputFormats.CSS:
                data = useTailwindFormat
                    ? await exportToTailwind(useSingleDashSeparator, useCodeSyntaxName, exportUnit, rootFontSize, appendPxToUnscoped)
                    : await exportToCSS(useSingleDashSeparator, useCodeSyntaxName, exportUnit, rootFontSize, appendPxToUnscoped);
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }

        figma.ui.postMessage({
            type: MessageTypes.EXPORT_SUCCESS_RESULT,
            format,
            data,
            files,
            usedExtendedCollections,
        } as PluginMessage);

        figma.notify('✅ All variables were exported.');
    } catch (error) {
        console.error(error);
        figma.notify('Something went wrong while attempting to export the variables. Check the console for more info.', {
            error: true
        });
        
        figma.ui.postMessage({
            type: MessageTypes.EXPORT_ERROR,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        } as PluginMessage);
    }
}

/**
 * Handles import preview requests: computes what an import would do without
 * touching the document, so the UI can show a diff before the user confirms.
 * The root font size is what any `rem`/`em` value in the file is multiplied by,
 * so the previewed numbers are exactly the ones the real run would write.
 */
async function handleImportPreview(importFiles: string[], importMode: ImportMode, rootFontSize: number = DEFAULT_ROOT_FONT_SIZE) {
    try {
        const { summary, diff } = await previewImport(importFiles, importMode, rootFontSize);

        figma.ui.postMessage({
            type: MessageTypes.IMPORT_PREVIEW_RESULT,
            importSummary: summary,
            importDiff: diff,
        } as PluginMessage);
    } catch (error) {
        console.error(error);
        figma.notify('Something went wrong while previewing the import. Check the console for more info.', {
            error: true
        });

        figma.ui.postMessage({
            type: MessageTypes.IMPORT_ERROR,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        } as PluginMessage);
    }
}

/**
 * Handles import requests: parses the uploaded JSON file(s) and recreates
 * collections, modes, variables and their values (including linked variables)
 * in the current document.
 */
async function handleImport(importFiles: string[], importMode: ImportMode, rootFontSize: number = DEFAULT_ROOT_FONT_SIZE) {
    try {
        const importSummary = await importVariables(importFiles, importMode, rootFontSize);

        figma.ui.postMessage({
            type: MessageTypes.IMPORT_SUCCESS_RESULT,
            importSummary,
        } as PluginMessage);

        figma.notify('✅ Variables were imported.');
    } catch (error) {
        console.error(error);
        figma.notify('Something went wrong while attempting to import the variables. Check the console for more info.', {
            error: true
        });

        figma.ui.postMessage({
            type: MessageTypes.IMPORT_ERROR,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        } as PluginMessage);
    }
}

/**
 * Main message handler for plugin communication
 */
figma.ui.onmessage = async (msg: PluginMessage) => {
    switch (msg.type) {
        case MessageTypes.GET_BASIC_INFO:
            await handleBasicInfo(msg.command);
            break;

        case MessageTypes.EXPORT_SUCCESS:
            if (msg.format) {
                await handleExport(msg.format, msg.useLinkedVarRowAndColPos || false, msg.useTailwindFormat || false, msg.useLegacyFormat || false, msg.useSingleDashSeparator || false, msg.useCodeSyntaxName || false, msg.exportUnit || DEFAULT_EXPORT_UNIT, msg.rootFontSize || DEFAULT_ROOT_FONT_SIZE, msg.appendPxToUnscoped || false, msg.dtcgCompliantValues !== false);
            } else {
                console.error('Export request missing format');
            }
            break;

        case MessageTypes.OPEN_EXTERNAL:
            // The UI iframe can't navigate the browser itself, so links post the
            // URL here and the sandbox opens it.
            if (msg.url && /^https?:\/\//i.test(msg.url)) {
                figma.openExternal(msg.url);
            } else {
                console.error('Open-external request missing a valid http(s) URL');
            }
            break;

        case MessageTypes.IMPORT_PREVIEW_REQUEST:
            if (msg.importFiles && msg.importFiles.length > 0) {
                await handleImportPreview(msg.importFiles, msg.importMode || ImportMode.MERGE, msg.rootFontSize || DEFAULT_ROOT_FONT_SIZE);
            } else {
                console.error('Import preview request missing files');
            }
            break;

        case MessageTypes.IMPORT_REQUEST:
            if (msg.importFiles && msg.importFiles.length > 0) {
                await handleImport(msg.importFiles, msg.importMode || ImportMode.MERGE, msg.rootFontSize || DEFAULT_ROOT_FONT_SIZE);
            } else {
                console.error('Import request missing files');
            }
            break;

        default:
            console.warn(`Unknown message type: ${msg.type}`);
    }
};
