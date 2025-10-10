import React from "react";
import { Text, Link } from "figma-kit";

/**
 * Footer component with plugin information and links
 */
export const Footer: React.FC = () => {
    return (
        <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
            This is an open source plugin. <Link target="_blank" href="https://github.com/atropical/varvar">Contribute ↗</Link>
            <br />
            AI vibed + human polished from Norway by <Link target="_blank" href="https://atropical.no?utm_source=figma-plugin">Atropical</Link>.
        </Text>
    );
};
