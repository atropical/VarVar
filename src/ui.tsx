import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { TooltipProvider } from "figma-kit";
import "figma-kit/styles.css";
import "./styles/highlightCode.css";
import { PluginCommands, MessageTypes, PluginMessage } from "./types.d";
import { ExportView } from "./views/ExportView";
import { ExportJSON } from "./views/ExportJSON";
import { ExportCSV } from "./views/ExportCSV";
import { ExportCSS } from "./views/ExportCSS";
import { ExportJS } from "./views/ExportJS";
import { ImportJSON } from "./views/ImportJSON";

/**
 * Main App component that routes to format-specific views based on command
 */
const App: React.FC = () => {
    const [command, setCommand] = useState<PluginCommands>(PluginCommands.EXPORT_GENERIC);
    const [editorType, setEditorType] = useState<string>("");

    useEffect(() => {
        // Listen for command from plugin code
        const handleMessage = ({ data: { pluginMessage } }: { data: { pluginMessage: PluginMessage } }) => {
            if (pluginMessage.type === MessageTypes.BASIC_INFO && pluginMessage.command) {
                setCommand(pluginMessage.command);
                setEditorType(pluginMessage.editorType || "");
            }
            // Don't prevent other messages from reaching child components
        };
        
        window.addEventListener('message', handleMessage);
        
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    // Render appropriate view based on command
    switch (command) {
        case PluginCommands.EXPORT_JSON:
            return <ExportJSON editorType={editorType} />;
        case PluginCommands.EXPORT_CSV:
            return <ExportCSV editorType={editorType} />;
        case PluginCommands.EXPORT_CSS:
            return <ExportCSS editorType={editorType} />;
        case PluginCommands.EXPORT_JS:
            return <ExportJS editorType={editorType} />;
        case PluginCommands.IMPORT_JSON:
            return <ImportJSON editorType={editorType} />;
        case PluginCommands.EXPORT_GENERIC:
        default:
            return <ExportView editorType={editorType} />;
    }
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Single Radix tooltip provider for the whole UI — every Tooltip needs one above it */}
    <TooltipProvider delayDuration={300}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
