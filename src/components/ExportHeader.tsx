import React from "react";
import { Text, Flex } from "figma-kit";
import { OutputFormats } from "../types.d";

interface ExportHeaderProps {
    format: OutputFormats;
}

/**
 * Header component displaying format-specific title and description
 */
export const ExportHeader: React.FC<ExportHeaderProps> = ({ format }) => {
    const getFormatInfo = (format: OutputFormats) => {
        switch (format) {
            case OutputFormats.JSON:
                return {
                    title: "Export as JSON",
                    description: "Export variables as structured JSON data with nested groups and type information."
                };
            case OutputFormats.CSV:
                return {
                    title: "Export as CSV", 
                    description: "Export variables as CSV data for spreadsheet applications with optional row/column positioning."
                };
            case OutputFormats.CSS:
                return {
                    title: "Export as CSS",
                    description: "Export variables as CSS custom properties (CSS variables) for web development."
                };
            case OutputFormats.JS:
                return {
                    title: "Export as JavaScript",
                    description: "Export variables as JavaScript objects with proper variable references."
                };
            default:
                return {
                    title: "Export Variables",
                    description: "Choose your preferred export format below."
                };
        }
    };

    const { title, description } = getFormatInfo(format);

    return (
        <Flex direction="column" gap="2">
            <Text size="large" weight="strong">{title}</Text>
            <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                {description}
            </Text>
        </Flex>
    );
};
