import React, { useMemo, useState } from "react";
import { Flex, Input, Text, Button } from "figma-kit";
import { compatibility } from "../../composer/fields";
import type { Compatibility, FieldSpec } from "../../composer/fields";
import { resolveVariableValue } from "../../composer/model";
import type { CatalogIndex } from "../../composer/model";
import { formatRaw } from "../../composer/ops";
import type { CatalogVariable, ModeSelection } from "../../composer/types";
import { colorCss } from "../../composer/css";
import { muted } from "./ui";

interface TokenPickerProps {
    spec: FieldSpec;
    variables: CatalogVariable[];
    index: CatalogIndex;
    modes: ModeSelection;
    currentId?: string;
    libraryLoading: boolean;
    onPick: (variableId: string) => void;
    onClose: () => void;
}

const GROUP_LABELS: Record<Exclude<Compatibility, "incompatible">, string> = {
    scoped: "Scoped for this field",
    unscoped: "Unscoped",
    "other-scope": "Scoped for something else",
};

const MAX_ROWS = 200;

/** A small swatch or value preview for a variable, resolved in the current modes. */
export const VariableValue: React.FC<{ variable: CatalogVariable; index: CatalogIndex; modes: ModeSelection }> = ({ variable, index, modes }) => {
    if (variable.unimported) return <Text style={muted}>library</Text>;
    const value = resolveVariableValue(variable.id, index, modes);
    if (value === undefined) return null;
    if (typeof value === "object") {
        return (
            <span
                title={formatRaw(value as RGBA)}
                style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: colorCss(value as RGBA), boxShadow: "inset 0 0 0 1px var(--figma-color-border)" }}
            />
        );
    }
    return <Text style={{ ...muted, fontFamily: "monospace" }}>{typeof value === "number" ? formatRaw(value) : String(value)}</Text>;
};

/**
 * Inline variable picker for one field. Only type-compatible variables are
 * listed, grouped so that those scoped for the field come first, unscoped
 * ones next, and those explicitly scoped elsewhere last (collapsed).
 */
export const TokenPicker: React.FC<TokenPickerProps> = ({ spec, variables, index, modes, currentId, libraryLoading, onPick, onClose }) => {
    const [query, setQuery] = useState("");
    const [showOther, setShowOther] = useState(false);

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const out: Record<Exclude<Compatibility, "incompatible">, CatalogVariable[]> = { scoped: [], unscoped: [], "other-scope": [] };
        for (const v of variables) {
            const c = compatibility(spec, v);
            if (c === "incompatible") continue;
            if (q && !`${v.collectionName}/${v.name}`.toLowerCase().includes(q)) continue;
            out[c].push(v);
        }
        return out;
    }, [variables, spec, query]);

    const renderGroup = (key: Exclude<Compatibility, "incompatible">) => {
        const list = groups[key];
        if (list.length === 0) return null;
        return (
            <Flex direction="column" gap="1" key={key}>
                <Text style={{ ...muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {GROUP_LABELS[key]} ({list.length})
                </Text>
                {list.slice(0, MAX_ROWS).map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => onPick(v.id)}
                        style={{
                            all: "unset",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "3px 6px",
                            borderRadius: 4,
                            background: v.id === currentId ? "var(--figma-color-bg-selected)" : undefined,
                        }}
                    >
                        <VariableValue variable={v} index={index} modes={modes} />
                        <Text style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</Text>
                        <Text style={{ ...muted, whiteSpace: "nowrap" }}>{v.libraryName ? `${v.libraryName} · ` : ""}{v.collectionName}</Text>
                    </button>
                ))}
                {list.length > MAX_ROWS && <Text style={muted}>{list.length - MAX_ROWS} more — refine the search.</Text>}
            </Flex>
        );
    };

    const empty = groups.scoped.length + groups.unscoped.length + groups["other-scope"].length === 0;

    return (
        <Flex
            direction="column"
            gap="2"
            style={{ padding: 8, border: "1px solid var(--figma-color-border)", borderRadius: 6, background: "var(--figma-color-bg-secondary)" }}
        >
            <Flex gap="2" align="center">
                <Input autoFocus placeholder={`Search ${spec.label.toLowerCase()} tokens`} value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
                <Button variant="secondary" onClick={onClose}>Close</Button>
            </Flex>
            <Flex direction="column" gap="2" style={{ maxHeight: 220, overflowY: "auto" }}>
                {renderGroup("scoped")}
                {renderGroup("unscoped")}
                {groups["other-scope"].length > 0 && (
                    showOther ? renderGroup("other-scope") : (
                        <Button variant="text" onClick={() => setShowOther(true)}>
                            Show {groups["other-scope"].length} scoped for other fields
                        </Button>
                    )
                )}
                {empty && <Text style={muted}>No {spec.resolvedTypes.join("/").toLowerCase()} variables match.</Text>}
                {libraryLoading && <Text style={muted}>Loading library variables…</Text>}
            </Flex>
        </Flex>
    );
};
