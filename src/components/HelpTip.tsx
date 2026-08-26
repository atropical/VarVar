import React from "react";
import { Tooltip } from "figma-kit";

interface HelpTipProps {
    content: React.ReactNode;
    label?: string;
}

/**
 * Small circular "?" badge that reveals its help text in a figma-kit Tooltip
 * on hover and on keyboard focus.
 *
 * The trigger is a real <button type="button"> so it is focusable and reachable
 * with the keyboard, but it carries no click behaviour and never submits a form
 * or toggles the Switch it sits next to — it only opens the tooltip.
 */
export const HelpTip: React.FC<HelpTipProps> = ({ content, label = "More information" }) => {
    return (
        <Tooltip
            content={content}
            side="top"
            align="center"
            sideOffset={4}
            collisionPadding={8}
            style={{ maxWidth: '260px' }}
        >
            <button
                type="button"
                aria-label={label}
                onClick={(event) => event.preventDefault()}
                style={{ backgroundColor: 'var(--figma-color-text-secondary)', fontFamily: 'sans-serif', cursor: 'help', userSelect: 'none', color: 'var(--figma-color-text-secondary-inverse)', borderRadius: '50%', padding: '1px', fontSize: '.6em', width: '1em', height: '1em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'content-box', border: 'none', margin: 0, appearance: 'none' }}
            >
                ?
            </button>
        </Tooltip>
    );
};
