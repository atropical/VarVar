import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "figma-kit/styles.css";
import { PluginCommands, MessageTypes } from "./types.d";
import { ExportView } from "./views/ExportView";
import { ExportJSON } from "./views/ExportJSON";
import { ExportCSV } from "./views/ExportCSV";
import { ExportCSS } from "./views/ExportCSS";
import { ExportJS } from "./views/ExportJS";

/**
 * Main App component that routes to format-specific views based on command
 */
const App: React.FC = () => {
    const [command, setCommand] = useState<PluginCommands>(PluginCommands.EXPORT_GENERIC);
    const [editorType, setEditorType] = useState<string>("");

    useEffect(() => {
        // Listen for command from plugin code
        window.onmessage = ({ data: { pluginMessage } }) => {
            if (pluginMessage.type === MessageTypes.BASIC_INFO && pluginMessage.command) {
                setCommand(pluginMessage.command);
                setEditorType(pluginMessage.editorType || "");
            }
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
        case PluginCommands.EXPORT_GENERIC:
        default:
            return <ExportView editorType={editorType} />;
    }
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
