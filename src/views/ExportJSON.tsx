import React from "react";
import { OutputFormats } from "../types.d";
import { PluginDialogShell } from "../components/PluginDialogShell";
import { ExportHeader } from "../components/ExportHeader";
import { FilenameInput } from "../components/FilenameInput";
import { ExportOptions } from "../components/ExportOptions";
import { ExportButton } from "../components/ExportButton";
import { OutputPreview } from "../components/OutputPreview";
import { ExportLayout } from "../components/ExportLayout";
import { useExportData } from "../hooks/useExportData";

interface ExportJSONProps {
    editorType?: string;
}

/**
 * JSON-specific export view
 */
export const ExportJSON: React.FC<ExportJSONProps> = ({ editorType = "" }) => {
    const format = OutputFormats.JSON;
    const {
        filename,
        setFilename,
        seeOutput,
        setSeeOutput,
        exportedData,
        variablesCount,
        handleExport,
        handleSelectToCopy,
        handleDownload
    } = useExportData({ format });

    const formControls = (
        <>
            <ExportHeader format={format} />

            <ExportOptions
                format={format}
                seeOutput={seeOutput}
                useRowColumnPos={false}
                onSeeOutputChange={setSeeOutput}
                onUseRowColumnPosChange={() => {}}
            />

            <FilenameInput 
                format={format}
                filename={filename}
                onFilenameChange={setFilename}
            />

            <ExportButton 
                variablesCount={variablesCount}
                hasExportedData={!!exportedData}
                showPreview={seeOutput}
                onExport={handleExport}
                onDownload={handleDownload}
            />
        </>
    );

    const preview = seeOutput && exportedData ? (
        <OutputPreview 
            exportedData={exportedData}
            editorType={editorType}
            onSelectToCopy={handleSelectToCopy}
        />
    ) : null;

    return (
        <PluginDialogShell>
            <ExportLayout 
                editorType={editorType}
                children={formControls}
                preview={preview}
            />
        </PluginDialogShell>
    );
};
