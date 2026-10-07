import React, { useMemo, useState } from "react";
import { Flex, Input, Text } from "figma-kit";
import type { StyleDraft, StyleKind } from "../../composer/types";
import { STYLE_KINDS, STYLE_KIND_LABELS } from "../../composer/types";
import { paintsToCss } from "../../composer/css";
import { resolveDraft } from "../../composer/model";
import type { CatalogIndex } from "../../composer/model";
import { Check, iconButton, muted } from "./ui";

interface StyleListProps {
    order: string[];
    drafts: Map<string, StyleDraft>;
    deleted: Set<string>;
    dirtyKeys: Set<string>;
    selectedKey: string | null;
    checked: Set<string>;
    index: CatalogIndex;
    onSelect: (key: string) => void;
    onCheckedChange: (checked: Set<string>) => void;
    /** Reorders a style within its folder; omitted when read-only. */
    onMove?: (key: string, delta: -1 | 1) => void;
}

const Swatch: React.FC<{ draft: StyleDraft; index: CatalogIndex }> = ({ draft, index }) => {
    if (draft.kind !== "PAINT") {
        const letter = { TEXT: "Ag", EFFECT: "◐", GRID: "#" }[draft.kind];
        return <Text style={{ ...muted, width: 16, textAlign: "center", fontSize: 10 }}>{letter}</Text>;
    }
    const css = paintsToCss(resolveDraft(draft, index, {}).paints ?? []);
    return <span style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, boxShadow: "inset 0 0 0 1px var(--figma-color-border)", ...css.style }} />;
};

/**
 * Left column: every style (stored and new), searchable and filterable by
 * kind, grouped by the folder part of the name. Checkboxes build the
 * selection bulk actions work on; clicking a row opens it in the editor.
 */
export const StyleList: React.FC<StyleListProps> = ({ order, drafts, deleted, dirtyKeys, selectedKey, checked, index, onSelect, onCheckedChange, onMove }) => {
    const [query, setQuery] = useState("");
    const [kinds, setKinds] = useState<Set<StyleKind>>(new Set(STYLE_KINDS));

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return order
            .map((k) => drafts.get(k))
            .filter((d): d is StyleDraft => !!d && kinds.has(d.kind) && (!q || d.name.toLowerCase().includes(q)));
    }, [order, drafts, kinds, query]);

    const grouped = useMemo(() => {
        const groups = new Map<string, StyleDraft[]>();
        for (const d of visible) {
            const folder = `${STYLE_KIND_LABELS[d.kind]}${d.name.includes("/") ? ` · ${d.name.slice(0, d.name.lastIndexOf("/"))}` : ""}`;
            if (!groups.has(folder)) groups.set(folder, []);
            groups.get(folder)!.push(d);
        }
        return [...groups.entries()];
    }, [visible]);

    const toggle = (key: string) => {
        const next = new Set(checked);
        if (next.has(key)) next.delete(key); else next.add(key);
        onCheckedChange(next);
    };
    const allVisibleChecked = visible.length > 0 && visible.every((d) => checked.has(d.key));

    return (
        <Flex direction="column" gap="2" style={{ minHeight: 0, flex: 1 }}>
            <Input placeholder="Search styles" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search styles" />
            <Flex gap="1" style={{ flexWrap: "wrap" }}>
                {STYLE_KINDS.map((k) => {
                    const active = kinds.has(k);
                    return (
                        <button
                            key={k}
                            type="button"
                            onClick={() => {
                                const next = new Set(kinds);
                                if (active) next.delete(k); else next.add(k);
                                setKinds(next);
                            }}
                            style={{
                                all: "unset", cursor: "pointer", padding: "1px 8px", borderRadius: 12, fontSize: 11,
                                border: `1px solid ${active ? "transparent" : "var(--figma-color-border)"}`,
                                background: active ? "var(--figma-color-bg-selected)" : "transparent",
                                color: active ? "var(--figma-color-text)" : "var(--figma-color-text-secondary)",
                            }}
                        >
                            {STYLE_KIND_LABELS[k]}
                        </button>
                    );
                })}
            </Flex>
            <Flex gap="2" align="center">
                <Check
                    checked={allVisibleChecked}
                    onChange={(v) => {
                        const next = new Set(checked);
                        for (const d of visible) {
                            if (v) next.add(d.key); else next.delete(d.key);
                        }
                        onCheckedChange(next);
                    }}
                    label="Select all visible styles"
                />
                <Text style={muted}>{checked.size > 0 ? `${checked.size} selected` : `${visible.length} styles`}</Text>
            </Flex>
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                {grouped.length === 0 && <Text style={muted}>No styles match.</Text>}
                {grouped.map(([folder, items]) => (
                    <div key={folder} style={{ marginBottom: 8 }}>
                        <Text style={{ ...muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{folder}</Text>
                        {items.map((d) => {
                            const isDeleted = deleted.has(d.key);
                            return (
                                <div
                                    key={d.key}
                                    onClick={() => onSelect(d.key)}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", borderRadius: 4, cursor: "pointer",
                                        background: d.key === selectedKey ? "var(--figma-color-bg-selected)" : undefined,
                                    }}
                                >
                                    <span onClick={(e) => e.stopPropagation()}>
                                        <Check checked={checked.has(d.key)} onChange={() => toggle(d.key)} label={`Select ${d.name}`} />
                                    </span>
                                    <Swatch draft={d} index={index} />
                                    <Text style={{
                                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                        textDecoration: isDeleted ? "line-through" : undefined,
                                        color: isDeleted ? "var(--figma-color-text-danger)" : undefined,
                                    }}>
                                        {d.name.split("/").pop() || "(unnamed)"}
                                    </Text>
                                    {!d.id && <Text style={{ fontSize: 10, color: "var(--figma-color-text-success)" }}>new</Text>}
                                    {d.id && dirtyKeys.has(d.key) && !isDeleted && <span title="Edited" style={{ width: 6, height: 6, borderRadius: 3, background: "var(--figma-color-text-brand)" }} />}
                                    {onMove && d.key === selectedKey && (
                                        <span onClick={(e) => e.stopPropagation()} style={{ display: "flex" }}>
                                            <button type="button" style={iconButton} title="Move up" onClick={() => onMove(d.key, -1)}>↑</button>
                                            <button type="button" style={iconButton} title="Move down" onClick={() => onMove(d.key, 1)}>↓</button>
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </Flex>
    );
};
