import React from "react";
import { Button } from "figma-kit";

interface ExportButtonProps {
    variablesCount: number;
    hasExportedData: boolean;
    showPreview: boolean;
    onExport: () => void;
    onDownload: () => void;
}

/**
 * Export button component with variable count display
 * Conditionally shows Export or Download button based on state
 */
export const ExportButton: React.FC<ExportButtonProps> = ({ 
    variablesCount, 
    hasExportedData,
    showPreview,
    onExport,
    onDownload
}) => {
    const shouldShowDownload = hasExportedData && showPreview;

    return (
        <Button
            variant="primary"
            fullWidth={true}
            size="medium"
            onClick={shouldShowDownload ? onDownload : onExport}
        >
            {shouldShowDownload ? "Download File" : `Export Variables (${variablesCount})`}
        </Button>
    );
};
