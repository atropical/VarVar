import React from "react";
import { Checkbox, Select, Text } from "figma-kit";

/** Small shared styles and bits for the composer's components. */

export const muted: React.CSSProperties = { color: "var(--figma-color-text-secondary)" };

export const panel: React.CSSProperties = {
    border: "1px solid var(--figma-color-border)",
    borderRadius: 6,
    padding: 8,
};

export const iconButton: React.CSSProperties = {
    all: "unset", fontFamily: "var(--font-family-default)",
    cursor: "pointer",
    padding: "0 6px",
    borderRadius: 4,
    lineHeight: "20px",
    color: "var(--figma-color-text-secondary)",
};

export const BetaBadge: React.FC = () => (
    <Text
        style={{
            display: "inline-block",
            padding: "0 6px",
            borderRadius: 3,
            fontSize: 10,
            letterSpacing: 0.4,
            backgroundColor: "var(--figma-color-bg-brand-tertiary, rgba(59,130,246,.15))",
            color: "var(--figma-color-text-brand)",
        }}
    >
        BETA
    </Text>
);

const ACTION_COLORS: Record<string, string> = {
    create: "var(--figma-color-text-success, #22c55e)",
    update: "var(--figma-color-text-brand, #3b82f6)",
    delete: "var(--figma-color-text-danger, #ef4444)",
};

export const ActionTag: React.FC<{ action: string }> = ({ action }) => (
    <Text style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: ACTION_COLORS[action] ?? "inherit" }}>
        {action}
    </Text>
);

/** A checkerboard so transparency in swatches and renders is visible. */
export const checkerboard: React.CSSProperties = {
    backgroundColor: "#fff",
    backgroundImage:
        "linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)",
    backgroundSize: "12px 12px",
    backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
};

export const ErrorBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
        style={{
            padding: "0.5rem",
            border: "1px solid var(--figma-color-border-danger-strong)",
            borderRadius: 4,
            backgroundColor: "var(--figma-color-bg-danger)",
            color: "var(--figma-color-text-ondanger)",
            whiteSpace: "pre-wrap",
        }}
    >
        {children}
    </div>
);

/** A compact select over a fixed list of options. */
export function OptionSelect<T extends string>({ value, options, onChange, disabled, width = 140, label }: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
    disabled?: boolean;
    width?: number;
    label?: string;
}) {
    return (
        <Select.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
            <Select.Trigger aria-label={label} style={{ width, flexShrink: 0 }} />
            {/* Popper-positioned Radix content has no height limit of its own; cap it so long lists scroll. */}
            <Select.Content
                portal
                position="popper"
                sideOffset={4}
                style={{ maxHeight: "min(320px, var(--radix-select-content-available-height))" }}
            >
                {options.map((o) => (
                    <Select.Item key={o.value} value={o.value}>{o.label}</Select.Item>
                ))}
            </Select.Content>
        </Select.Root>
    );
}

/** A bare checkbox (figma-kit's Root + Input pair). */
export const Check: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
    <Checkbox.Root>
        <Checkbox.Input checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    </Checkbox.Root>
);
