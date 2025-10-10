import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "figma-kit/styles.css";
import { PluginCommands, MessageTypes } from "./types.d";
import { PluginDialogShell } from "./components/PluginDialogShell";
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

    useEffect(() => {
        // Listen for command from plugin code
        window.onmessage = ({ data: { pluginMessage } }) => {
            if (pluginMessage.type === MessageTypes.BASIC_INFO && pluginMessage.command) {
                console.log('Received command:', pluginMessage.command);
                setCommand(pluginMessage.command);
            }
        };
    }, []);

    // Render appropriate view based on command
    switch (command) {
        case PluginCommands.EXPORT_JSON:
            return <ExportJSON />;
        case PluginCommands.EXPORT_CSV:
            return <ExportCSV />;
        case PluginCommands.EXPORT_CSS:
            return <ExportCSS />;
        case PluginCommands.EXPORT_JS:
            return <ExportJS />;
        case PluginCommands.EXPORT_GENERIC:
        default:
            return <ExportView />;
    }
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
