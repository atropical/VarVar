import React from "react";
import { MessageTypes } from "../types.d";

/**
 * A plugin iframe can't navigate the browser itself, so a link asks the plugin
 * sandbox to do it: the sandbox answers `MessageTypes.OPEN_EXTERNAL` with
 * `figma.openExternal(url)`. Rendered as a real <button> so it stays keyboard
 * reachable, styled to read as a link.
 */
export const ExternalLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
    <button
        type="button"
        onClick={() => {
            parent.postMessage({ pluginMessage: { type: MessageTypes.OPEN_EXTERNAL, url: href } }, "*");
        }}
        style={{ appearance: 'none', background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'var(--figma-color-text-brand)', textDecoration: 'underline', cursor: 'pointer' }}
    >
        {children}
    </button>
);
