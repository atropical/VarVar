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

interface ExportCSVProps {
    editorType?: string;
}

/**
 * CSV-specific export view with row/column positioning option
 */
export const ExportCSV: React.FC<ExportCSVProps> = ({ editorType = "" }) => {
    const format = OutputFormats.CSV;
    const {
        filename,
        setFilename,
        seeOutput,
        setSeeOutput,
        useRowColumnPos,
        setUseRowColumnPos,
        exportedData,
        usedExtendedCollections,
        variablesCount,
        handleExport,
        handleSelectToCopy,
        handleDownload
    } = useExportData({ format, useRowColumnPos: false });

    const formControls = (
        <>
            <ExportHeader format={format} />

            <ExportOptions
                format={format}
                seeOutput={seeOutput}
                useRowColumnPos={useRowColumnPos}
                onSeeOutputChange={setSeeOutput}
                onUseRowColumnPosChange={setUseRowColumnPos}
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
            usedExtendedCollections={usedExtendedCollections}
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
