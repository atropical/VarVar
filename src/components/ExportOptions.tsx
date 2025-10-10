import React from "react";
import { Flex, Switch, Label } from "figma-kit";
import { OutputFormats } from "../types.d";

interface ExportOptionsProps {
    format: OutputFormats;
    seeOutput: boolean;
    useRowColumnPos: boolean;
    onSeeOutputChange: (seeOutput: boolean) => void;
    onUseRowColumnPosChange: (useRowColumnPos: boolean) => void;
}

/**
 * Format-specific export options component
 */
export const ExportOptions: React.FC<ExportOptionsProps> = ({
    format,
    seeOutput,
    useRowColumnPos,
    onSeeOutputChange,
    onUseRowColumnPosChange
}) => {
    return (
        <Flex gap="2" direction="column">
            <Label style={{ color: 'var(--figma-color-text-secondary)' }}>
                Options
            </Label>
            
            {/* CSV-specific option */}
            {format === OutputFormats.CSV && (
                <Flex gap="2">
                    <Switch 
                        id="varvar-export-row-column-pos" 
                        onCheckedChange={onUseRowColumnPosChange} 
                        checked={useRowColumnPos} 
                    />
                    <Label htmlFor="varvar-export-row-column-pos">
                        Use row &amp; column positions (i.e.: <code>=E7</code>) for linked vars
                    </Label>
                </Flex>
            )}
            
            {/* Preview option - available for all formats */}
            <Flex gap="2">
                <Switch 
                    id="varvar-preview-output" 
                    onCheckedChange={onSeeOutputChange} 
                    checked={seeOutput} 
                />
                <Label htmlFor="varvar-preview-output">
                    Preview output
                </Label>
            </Flex>
        </Flex>
    );
};
