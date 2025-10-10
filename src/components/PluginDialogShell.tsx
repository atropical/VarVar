import React from "react";
import { Flex } from "figma-kit";
import { Footer } from "./Footer";

interface PluginDialogShellProps {
    children: React.ReactNode;
    showFooter?: boolean;
}

/**
 * Shell component that provides consistent layout, padding, and common elements
 * for all plugin dialog views
 */
export const PluginDialogShell: React.FC<PluginDialogShellProps> = ({ 
    children, 
    showFooter = true 
}) => {
    return (
        <Flex 
            direction="column" 
            gap="4"
            justify="between"
            style={{
                padding: "1rem",
                boxSizing: "border-box",
                minHeight: "100%",
            }}
        >
            {children}
            {showFooter && <Footer />}
        </Flex>
    );
};
