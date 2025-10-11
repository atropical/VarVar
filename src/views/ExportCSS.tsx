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

interface ExportCSSProps {
    editorType?: string;
}

/**
 * CSS-specific export view
 */
export const ExportCSS: React.FC<ExportCSSProps> = ({ editorType = "" }) => {
    const format = OutputFormats.CSS;
    const {
        filename,
        setFilename,
        seeOutput,
        setSeeOutput,
        useTailwindFormat,
        setUseTailwindFormat,
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
                useTailwindFormat={useTailwindFormat}
                onSeeOutputChange={setSeeOutput}
                onUseRowColumnPosChange={() => {}}
                onUseTailwindFormatChange={setUseTailwindFormat}
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
