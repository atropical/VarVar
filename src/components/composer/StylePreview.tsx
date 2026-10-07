import React, { useMemo } from "react";
import { Flex, Input, Text, Button } from "figma-kit";
import { collectionsUsedBy, resolveDraft } from "../../composer/model";
import type { CatalogIndex } from "../../composer/model";
import { colorCss, effectsToCss, paintsToCss, textToCss } from "../../composer/css";
import type { ModeSelection, StyleDraft } from "../../composer/types";
import type { ExactPreview, UsageState } from "../../hooks/useComposer";
import { USAGE_CAP } from "../../hooks/useComposer";
import { OptionSelect, checkerboard, muted, panel } from "./ui";

interface StylePreviewProps {
    draft: StyleDraft;
    index: CatalogIndex;
    modes: ModeSelection;
    onModesChange: (modes: ModeSelection) => void;
    sampleText: string;
    onSampleTextChange: (text: string) => void;
    exact: ExactPreview;
    usage?: UsageState;
    onCancelUsage: () => void;
    onRecountUsage: () => void;
}

/** The frame a grid preview pretends to be, scaled down to fit. */
const GRID_FRAME = { width: 1440, height: 900 };

interface Band { start: number; size: number }

/** Where the columns or rows of one layout grid fall along an axis. */
const gridBands = (g: RowsColsLayoutGrid, length: number): Band[] => {
    const offset = g.offset ?? 0;
    const gutter = g.gutterSize;
    if (g.alignment === "STRETCH") {
        const count = Number.isFinite(g.count) ? Math.max(1, g.count) : Math.max(1, Math.floor((length - 2 * offset + gutter) / ((g.sectionSize ?? 64) + gutter)));
        const size = (length - 2 * offset - gutter * (count - 1)) / count;
        return Array.from({ length: count }, (_, i) => ({ start: offset + i * (size + gutter), size }));
    }
    const size = g.sectionSize ?? 64;
    const count = Number.isFinite(g.count) ? Math.max(1, g.count) : Math.max(1, Math.floor((length + gutter) / (size + gutter)));
    const total = count * size + (count - 1) * gutter;
    const start = g.alignment === "MIN" ? offset : g.alignment === "MAX" ? length - offset - total : (length - total) / 2;
    return Array.from({ length: count }, (_, i) => ({ start: start + i * (size + gutter), size }));
};

const GridPreview: React.FC<{ grids: LayoutGrid[]; width: number }> = ({ grids, width }) => {
    const scale = width / GRID_FRAME.width;
    return (
        <div style={{ position: "relative", width, height: GRID_FRAME.height * scale, background: "#fff", overflow: "hidden", borderRadius: 4 }}>
            {grids.filter((g) => g.visible !== false).map((g, i) => {
                const color = colorCss(g.color ?? { r: 1, g: 0, b: 0, a: 0.1 });
                if (g.pattern === "GRID") {
                    const s = Math.max(2, g.sectionSize * scale);
                    return (
                        <div key={i} style={{
                            position: "absolute", inset: 0,
                            backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
                            backgroundSize: `${s}px ${s}px`,
                        }} />
                    );
                }
                const horizontal = g.pattern === "COLUMNS";
                return gridBands(g, horizontal ? GRID_FRAME.width : GRID_FRAME.height).map((b, j) => (
                    <div key={`${i}-${j}`} style={{
                        position: "absolute",
                        background: color,
                        ...(horizontal
                            ? { left: b.start * scale, width: b.size * scale, top: 0, bottom: 0 }
                            : { top: b.start * scale, height: b.size * scale, left: 0, right: 0 }),
                    }} />
                ));
            })}
        </div>
    );
};

const UsageLine: React.FC<{ usage?: UsageState; onCancel: () => void; onRecount: () => void }> = ({ usage, onCancel, onRecount }) => {
    if (!usage) return <Text style={muted}>Not saved yet, so not used anywhere.</Text>;
    switch (usage.status) {
        case "counting":
            return <Text style={muted}>Counting where this style is used…</Text>;
        case "slow":
            return (
                <Flex gap="2" align="center">
                    <Text style={muted}>Still counting (large file)…</Text>
                    <Button variant="text" onClick={onCancel}>Stop waiting</Button>
                </Flex>
            );
        case "cancelled":
            return (
                <Flex gap="2" align="center">
                    <Text style={muted}>Usage not counted.</Text>
                    <Button variant="text" onClick={onRecount}>Count</Button>
                </Flex>
            );
        case "done":
            return (
                <Text style={muted}>
                    Used by {usage.capped ? `${USAGE_CAP}+` : usage.count} layer{usage.count === 1 && !usage.capped ? "" : "s"} — changes apply to all of them.
                </Text>
            );
    }
};

/**
 * Two previews of the style being edited: an instant CSS rendering of the
 * draft with every token resolved in the chosen modes, and the exact PNG
 * Figma renders for it (not available for grids, which Figma never exports).
 */
export const StylePreview: React.FC<StylePreviewProps> = ({
    draft, index, modes, onModesChange, sampleText, onSampleTextChange, exact, usage, onCancelUsage, onRecountUsage,
}) => {
    const resolved = useMemo(() => resolveDraft(draft, index, modes), [draft, index, modes]);
    const modeCollections = useMemo(() => collectionsUsedBy(draft, index), [draft, index]);

    const instant = useMemo(() => {
        if (resolved.kind === "PAINT") return paintsToCss(resolved.paints ?? []);
        if (resolved.kind === "EFFECT") return effectsToCss(resolved.effects ?? []);
        if (resolved.kind === "TEXT" && resolved.text) return textToCss(resolved.text);
        return { style: {}, approximations: [] as string[] };
    }, [resolved]);

    const width = 280;

    return (
        <Flex direction="column" gap="3" style={{ minWidth: 0 }}>
            <Text weight="strong">Preview</Text>

            {modeCollections.length > 0 && (
                <Flex direction="column" gap="1">
                    {modeCollections.map((c) => (
                        <Flex key={c.id} gap="2" align="center">
                            <Text style={{ ...muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>{c.name}</Text>
                            <OptionSelect
                                label={`${c.name} mode`}
                                width={140}
                                value={modes[c.id] ?? c.defaultModeId}
                                options={c.modes.map((m) => ({ value: m.modeId, label: m.name }))}
                                onChange={(modeId) => onModesChange({ ...modes, [c.id]: modeId })}
                            />
                        </Flex>
                    ))}
                </Flex>
            )}

            {draft.kind === "TEXT" && (
                <Input value={sampleText} onChange={(e) => onSampleTextChange(e.target.value)} placeholder="Sample text" aria-label="Sample text" />
            )}

            <Flex direction="column" gap="1">
                <Text style={muted}>Instant</Text>
                {draft.kind === "PAINT" && <div style={{ ...checkerboard, borderRadius: 4, overflow: "hidden" }}><div style={{ height: 96, ...instant.style }} /></div>}
                {draft.kind === "EFFECT" && (
                    <div style={{ height: 150, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "repeating-linear-gradient(90deg, #f0f0f0 0 20px, #c0c7d9 20px 40px)" }}>
                        <div style={{ width: 140, height: 80, borderRadius: 8, background: "rgba(255,255,255,.85)", ...instant.style }} />
                    </div>
                )}
                {draft.kind === "TEXT" && (
                    <div style={{ background: "#fff", color: "#1a1a1a", padding: 12, borderRadius: 4, overflow: "hidden", wordBreak: "break-word" }}>
                        <div style={instant.style}>{sampleText || "The quick brown fox jumps over the lazy dog"}</div>
                    </div>
                )}
                {draft.kind === "GRID" && <GridPreview grids={resolved.grids ?? []} width={width} />}
                {instant.approximations.length > 0 && (
                    <Flex direction="column" gap="1">
                        {[...new Set(instant.approximations)].map((a) => <Text key={a} style={{ ...muted, fontSize: 11 }}>≈ {a}</Text>)}
                    </Flex>
                )}
            </Flex>

            {draft.kind !== "GRID" && (
                <Flex direction="column" gap="1">
                    <Text style={muted}>Exact (rendered by Figma){exact.pending ? " · updating…" : ""}</Text>
                    <div style={{ ...panel, padding: 0, overflow: "hidden", ...checkerboard, minHeight: 40 }}>
                        {exact.url && (
                            <img
                                src={exact.url}
                                alt="Exact render of the style"
                                style={{ display: "block", width: "100%", height: "auto", opacity: exact.pending ? 0.6 : 1 }}
                            />
                        )}
                    </div>
                    {exact.error && <Text style={{ fontSize: 11, color: "var(--figma-color-text-warning, #b45309)", whiteSpace: "pre-wrap" }}>{exact.error}</Text>}
                </Flex>
            )}

            {draft.id && <UsageLine usage={usage} onCancel={onCancelUsage} onRecount={onRecountUsage} />}
            {!draft.id && <UsageLine onCancel={onCancelUsage} onRecount={onRecountUsage} />}
        </Flex>
    );
};
