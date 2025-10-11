import React from "react";
import { Flex } from "figma-kit";

interface ExportLayoutProps {
    editorType?: string;
    children: React.ReactNode;
    preview: React.ReactNode;
}

/**
 * Responsive layout component that adapts based on editor type
 * - Design mode ("figma"): Horizontal layout with form on left, preview on right
 * - Dev mode ("dev"): Vertical layout with form on top, preview below
 */
export const ExportLayout: React.FC<ExportLayoutProps> = ({ 
    editorType, 
    children, 
    preview 
}) => {
    const isDesignMode = editorType === "figma";

    if (isDesignMode) {
        // Horizontal layout for Design mode
        return (
            <Flex 
                direction="row" 
                gap="4"
                style={{
                    position: "relative",
                }}
            >
                {/* Form controls on the left */}
                <Flex 
                    direction="column" 
                    gap="4"
                    style={{
                        flex: "1 1 200px",
                        position: "sticky",
                        margin: "0 auto",
                        top: '1rem',
                        minWidth: "250px",
                        alignSelf: "flex-start",
                    }}
                >
                    {children}
                </Flex>
                
                {/* Preview on the right - takes remaining space and full height */}
                {preview}
            </Flex>
        );
    }

    // Vertical layout for Dev mode (default)
    return (
        <Flex direction="column" gap="4">
            {children}
            {preview}
        </Flex>
    );
};
