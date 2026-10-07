import React, { useState } from "react";
import { Flex, Input, Text, Button } from "figma-kit";
import type { FieldEntry, CatalogIndex, RawValue } from "../../composer/model";
import { getBinding, getRaw, resolveVariableValue, setBinding, setRaw } from "../../composer/model";
import type { CatalogVariable, ModeSelection, StyleDraft } from "../../composer/types";
import { formatRaw } from "../../composer/ops";
import { TokenPicker, VariableValue } from "./TokenPicker";
import { muted } from "./ui";

interface FieldRowProps {
    draft: StyleDraft;
    entry: FieldEntry;
    variables: CatalogVariable[];
    index: CatalogIndex;
    modes: ModeSelection;
    libraryLoading: boolean;
    readOnly: boolean;
    onChange: (next: StyleDraft) => void;
}

const toHex = (c: RGB) => "#" + [c.r, c.g, c.b].map((n) => Math.round(n * 255).toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string): RGB => ({
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
});

/** Editor for an unbound value: colour + alpha, a number, or text. */
export const RawEditor: React.FC<{ value: RawValue | undefined; allowAuto: boolean; disabled: boolean; onChange: (v: RawValue) => void }> = ({ value, allowAuto, disabled, onChange }) => {
    if (value !== undefined && typeof value === "object") {
        return (
            <Flex gap="1" align="center">
                <input
                    type="color"
                    disabled={disabled}
                    value={toHex(value)}
                    onChange={(e) => onChange({ ...fromHex(e.target.value), a: value.a ?? 1 })}
                    style={{ width: 28, height: 22, padding: 0, border: "none", background: "none" }}
                />
                <Text style={{ fontFamily: "monospace", width: 64 }}>{toHex(value)}</Text>
                <Input
                    type="number"
                    min="0"
                    max="100"
                    disabled={disabled}
                    value={String(Math.round((value.a ?? 1) * 100))}
                    onChange={(e) => onChange({ ...value, a: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                    style={{ width: 56 }}
                    aria-label="Opacity %"
                />
                <Text style={muted}>%</Text>
            </Flex>
        );
    }
    const isNumber = typeof value === "number";
    return (
        <Input
            type={isNumber && !allowAuto ? "number" : "text"}
            disabled={disabled}
            value={value === undefined ? "" : isNumber ? formatRaw(value) : String(value)}
            placeholder={allowAuto ? "auto or a number" : undefined}
            onChange={(e) => {
                const raw = e.target.value;
                if (allowAuto && raw.trim().toLowerCase() === "auto") return onChange("auto");
                if (isNumber || allowAuto) {
                    const n = Number(raw);
                    if (raw.trim() !== "" && Number.isFinite(n)) onChange(n);
                } else {
                    onChange(raw);
                }
            }}
            style={{ width: 160 }}
        />
    );
};

/**
 * One bindable field: shows either its bound token (with the value it
 * resolves to in the previewed modes) or its raw value, and lets the user
 * bind, swap or detach a token, or edit the raw value.
 */
export const FieldRow: React.FC<FieldRowProps> = ({ draft, entry, variables, index, modes, libraryLoading, readOnly, onChange }) => {
    const [picking, setPicking] = useState(false);
    const boundId = getBinding(draft, entry.ref);
    const bound = boundId ? index.variables.get(boundId) : undefined;
    const allowAuto = entry.ref.kind === "text" && entry.ref.field === "lineHeight";

    const detach = () => {
        // Like Figma's own "detach", keep the value the token resolved to.
        let next = draft;
        const value = boundId ? resolveVariableValue(boundId, index, modes) : undefined;
        if (value !== undefined && typeof value !== "boolean") next = setRaw(next, entry.ref, value as RawValue);
        onChange(setBinding(next, entry.ref, null));
    };

    return (
        <Flex direction="column" gap="1" style={{ padding: "4px 0", borderBottom: "1px solid var(--figma-color-border)" }}>
            <Flex gap="2" align="center" style={{ minHeight: 28 }}>
                <Text style={{ width: 150, flexShrink: 0 }}>{entry.label}</Text>
                <Flex gap="2" align="center" style={{ flex: 1, minWidth: 0 }}>
                    {boundId ? (
                        <Flex
                            gap="2"
                            align="center"
                            style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: "var(--figma-color-bg-secondary)",
                                border: `1px solid ${bound ? "var(--figma-color-border)" : "var(--figma-color-border-danger-strong)"}`,
                                minWidth: 0,
                            }}
                            title={bound ? `${bound.collectionName} / ${bound.name}` : boundId}
                        >
                            {bound && <VariableValue variable={bound} index={index} modes={modes} />}
                            <Text style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {bound ? bound.name : "Missing variable"}
                            </Text>
                        </Flex>
                    ) : (
                        <RawEditor value={getRaw(draft, entry.ref)} allowAuto={allowAuto} disabled={readOnly} onChange={(v) => onChange(setRaw(draft, entry.ref, v))} />
                    )}
                </Flex>
                {!readOnly && (
                    <Flex gap="1">
                        <Button variant="secondary" onClick={() => setPicking((p) => !p)}>{boundId ? "Swap" : "Token"}</Button>
                        {boundId && <Button variant="secondary" onClick={detach}>Detach</Button>}
                    </Flex>
                )}
            </Flex>
            {picking && (
                <TokenPicker
                    spec={entry.spec}
                    variables={variables}
                    index={index}
                    modes={modes}
                    currentId={boundId}
                    libraryLoading={libraryLoading}
                    onClose={() => setPicking(false)}
                    onPick={(id) => {
                        let next = draft;
                        const value = resolveVariableValue(id, index, modes);
                        if (value !== undefined && typeof value !== "boolean") next = setRaw(next, entry.ref, value as RawValue);
                        onChange(setBinding(next, entry.ref, id));
                        setPicking(false);
                    }}
                />
            )}
        </Flex>
    );
};

