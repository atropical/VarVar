import React from "react";
import { Flex } from "figma-kit";
import { FilenameInput } from "./FilenameInput";
import { ExportButton } from "./ExportButton";
import { OutputFormats } from "../types.d";

interface ExportActionsProps {
    format: OutputFormats;
    filename: string;
    onFilenameChange: (filename: string) => void;
    variablesCount: number;
    hasExportedData: boolean;
    showPreview: boolean;
    onExport: () => void;
    onDownload: () => void;
}

/**
 * Filename field + export/download button, grouped so they can sit either
 * under the form controls or at the bottom of the preview column.
 */
export const ExportActions: React.FC<ExportActionsProps> = ({
    format,
    filename,
    onFilenameChange,
    variablesCount,
    hasExportedData,
    showPreview,
    onExport,
    onDownload
}) => (
    <Flex direction="column" gap="4">
        <FilenameInput
            format={format}
            filename={filename}
            onFilenameChange={onFilenameChange}
        />
        <ExportButton
            variablesCount={variablesCount}
            hasExportedData={hasExportedData}
            showPreview={showPreview}
            onExport={onExport}
            onDownload={onDownload}
        />
    </Flex>
);
