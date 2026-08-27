import React from "react";
import { Flex } from "figma-kit";

interface ExportLayoutProps {
    editorType?: string;
    children: React.ReactNode;
    preview: React.ReactNode;
    /**
     * Filename + export/download controls. They ride along with the preview:
     * once a preview is showing they sit at the bottom of the preview column,
     * otherwise they follow the form controls. Either way they stick to the
     * bottom of the viewport so they stay reachable without scrolling past
     * the rest of the column.
     */
    actions?: React.ReactNode;
}

/**
 * Responsive layout component that adapts based on editor type
 * - Design mode ("figma"): Horizontal layout with form on left, preview on right
 * - Dev mode ("dev"): Vertical layout with form on top, preview below
 */
export const ExportLayout: React.FC<ExportLayoutProps> = ({
    editorType,
    children,
    preview,
    actions
}) => {
    const isDesignMode = editorType === "figma";
    const hasPreview = !!preview;

    // Pinned to the bottom of the viewport so a long column never pushes the
    // export/download button out of reach.
    const stickyActions = actions ? (
        <div
            style={{
                position: "sticky",
                bottom: 0,
                paddingTop: "0.75rem",
                backgroundColor: "var(--figma-color-bg)",
            }}
        >
            {actions}
        </div>
    ) : null;

    if (isDesignMode) {
        // Horizontal layout for Design mode
        return (
            <Flex
                direction="row"
                gap="4"
                style={{
                    position: "relative",
                    flex: 1,
                    minHeight: 0,
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
                    {!hasPreview && stickyActions}
                </Flex>

                {/* Preview on the right - takes remaining space and full height */}
                {hasPreview && (
                    <Flex
                        direction="column"
                        gap="4"
                        style={{ flex: "2 1 300px", minWidth: 0, minHeight: 0 }}
                    >
                        {preview}
                        {stickyActions}
                    </Flex>
                )}
            </Flex>
        );
    }

    // Vertical layout for Dev mode (default)
    return (
        <Flex direction="column" gap="4" style={{ flex: 1, minHeight: 0 }}>
            {children}
            {!hasPreview && stickyActions}
            {preview}
            {hasPreview && stickyActions}
        </Flex>
    );
};
