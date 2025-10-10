/// <reference types="@figma/plugin-typings" />

import { exportToCSV } from "./utils/collectionToCSV";
import { exportToJSON } from "./utils/collectionToJSON";
import { exportToCSS } from "./utils/collectionToCSS";
import { exportToJS } from "./utils/collectionToJS";
import { OutputFormats, MessageTypes, PluginCommands, PluginMessage } from "./types.d";

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
        editorType: figma.editorType
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
        editorType: figma.editorType
    } as PluginMessage);
}

/**
 * Handles export requests with format-specific logic
 */
async function handleExport(format: OutputFormats, useLinkedVarRowAndColPos: boolean = false) {
    try {
        let data: string;
        
        switch (format) {
            case OutputFormats.CSV:
                data = await exportToCSV(useLinkedVarRowAndColPos) || '';
                break;
            case OutputFormats.JSON:
                data = await exportToJSON() || '';
                break;
            case OutputFormats.JS:
                data = await exportToJS() || '';
                break;
            case OutputFormats.CSS:
                data = await exportToCSS();
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
        
        figma.ui.postMessage({
            type: MessageTypes.EXPORT_SUCCESS_RESULT,
            format,
            data,
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
 * Main message handler for plugin communication
 */
figma.ui.onmessage = async (msg: PluginMessage) => {
    switch (msg.type) {
        case MessageTypes.GET_BASIC_INFO:
            await handleBasicInfo(msg.command);
            break;
            
        case MessageTypes.EXPORT_SUCCESS:
            if (msg.format) {
                await handleExport(msg.format, msg.useLinkedVarRowAndColPos || false);
            } else {
                console.error('Export request missing format');
            }
            break;
            
        default:
            console.warn(`Unknown message type: ${msg.type}`);
    }
};
