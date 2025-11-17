import React from "react";
import { Flex, Switch, Label } from "figma-kit";
import { OutputFormats } from "../types.d";

interface ExportOptionsProps {
    format: OutputFormats;
    seeOutput: boolean;
    useRowColumnPos: boolean;
    useTailwindFormat?: boolean;
    onSeeOutputChange: (seeOutput: boolean) => void;
    onUseRowColumnPosChange: (useRowColumnPos: boolean) => void;
    onUseTailwindFormatChange?: (useTailwindFormat: boolean) => void;
}

/**
 * Format-specific export options component
 */
export const ExportOptions: React.FC<ExportOptionsProps> = ({
    format,
    seeOutput,
    useRowColumnPos,
    useTailwindFormat = false,
    onSeeOutputChange,
    onUseRowColumnPosChange,
    onUseTailwindFormatChange
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
                        style={{ flexShrink: 0 }}
                    />
                    <Label htmlFor="varvar-export-row-column-pos">
                        Use row &amp; column positions (i.e.: <code>=E7</code>) for linked vars
                    </Label>
                </Flex>
            )}
            
            {/* CSS-specific option */}
            {format === OutputFormats.CSS && onUseTailwindFormatChange && (
                <Flex gap="2">
                    <Switch 
                        id="varvar-export-tailwind-format" 
                        onCheckedChange={onUseTailwindFormatChange} 
                        checked={useTailwindFormat} 
                        style={{ flexShrink: 0 }}
                    />
                    <Label htmlFor="varvar-export-tailwind-format">
                        Export as Tailwind CSS (v4)
                    </Label>
                    <span title="🧪 BETA: Exports the variables as Tailwind CSS (v4) format. It will also include the @theme directive and @custom-variant directives." style={{ backgroundColor: 'var(--figma-color-text-secondary)', fontFamily: 'sans-serif', cursor: 'help', userSelect: 'none', color: 'var(--figma-color-text-secondary-inverse)', borderRadius: '50%', padding: '1px', fontSize: '.6em', width: '1em', height: '1em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>?</span>
                </Flex>
            )}
            
            {/* Preview option - available for all formats */}
            <Flex gap="2">
                <Switch 
                    id="varvar-preview-output" 
                    onCheckedChange={onSeeOutputChange} 
                    checked={seeOutput} 
                    style={{ flexShrink: 0 }}
                />
                <Label htmlFor="varvar-preview-output">
                    Preview output
                </Label>
            </Flex>
        </Flex>
    );
};
