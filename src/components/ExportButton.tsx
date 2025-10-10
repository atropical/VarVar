import React from "react";
import { Button } from "figma-kit";

interface ExportButtonProps {
    variablesCount: number;
    onExport: () => void;
}

/**
 * Export button component with variable count display
 */
export const ExportButton: React.FC<ExportButtonProps> = ({ 
    variablesCount, 
    onExport 
}) => {
    return (
        <Button
            variant="primary"
            fullWidth={true}
            size="medium"
            onClick={onExport}
        >
            Export Variables ({variablesCount})
        </Button>
    );
};
