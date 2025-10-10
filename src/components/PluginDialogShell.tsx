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
            style={{
                padding: "8px",
                minHeight: "100vh",
                boxSizing: "border-box"
            }}
        >
            {children}
            {showFooter && <Footer />}
        </Flex>
    );
};
