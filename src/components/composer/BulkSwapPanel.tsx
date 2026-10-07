import React, { useMemo, useState } from "react";
import { Button, Flex, Input, Label, Text } from "figma-kit";
import { bulkSwap } from "../../composer/ops";
import type { CatalogIndex } from "../../composer/model";
import { getBinding, listFields } from "../../composer/model";
import type { CatalogVariable, StyleDraft } from "../../composer/types";
import { muted, panel } from "./ui";

interface BulkSwapPanelProps {
    targets: StyleDraft[];
    variables: CatalogVariable[];
    index: CatalogIndex;
    onApply: (drafts: StyleDraft[]) => void;
    onClose: () => void;
}

/** Common leading path of the names, cut at a "/" boundary. */
const commonPrefix = (names: string[]): string => {
    if (names.length === 0) return "";
    let prefix = names[0];
    for (const n of names) while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
    return prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/") + 1) : "";
};

/**
 * Re-points tokens across the selected styles in one go: every binding whose
 * variable name starts with "From" moves to the same name under "To". The
 * result is a set of draft edits, reviewed like any other change.
 */
export const BulkSwapPanel: React.FC<BulkSwapPanelProps> = ({ targets, variables, index, onApply, onClose }) => {
    const boundNames = useMemo(() => {
        const names = new Set<string>();
        for (const d of targets) {
            for (const f of listFields(d)) {
                const id = getBinding(d, f.ref);
                const v = id ? index.variables.get(id) : undefined;
                if (v) names.add(v.name);
            }
        }
        return [...names].sort();
    }, [targets, index]);

    const [from, setFrom] = useState(() => commonPrefix(boundNames));
    const [to, setTo] = useState("");

    const result = useMemo(
        () => (from && to ? bulkSwap(targets, from, to, variables, index) : null),
        [targets, from, to, variables, index],
    );

    return (
        <Flex direction="column" gap="3" style={{ flex: 1, minHeight: 0 }}>
            <Flex gap="2" align="center">
                <Text size="large" weight="strong">Swap tokens in {targets.length} style{targets.length === 1 ? "" : "s"}</Text>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" disabled={!result || result.swapped === 0} onClick={() => result && onApply(result.drafts)}>
                    Swap {result?.swapped ?? 0} binding{result?.swapped === 1 ? "" : "s"}
                </Button>
            </Flex>
            <Text style={muted}>
                Replace the start of each bound token's name. "color/brand/" → "color/accent/" moves color/brand/500 to
                color/accent/500. Use full names to swap a single token. Type must match; the same collection wins when names repeat.
            </Text>
            <Flex gap="3" align="end" style={{ flexWrap: "wrap" }}>
                <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 200 }}>
                    <Label htmlFor="swap-from">From</Label>
                    <Input id="swap-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="color/brand/" list="swap-bound-names" />
                </Flex>
                <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 200 }}>
                    <Label htmlFor="swap-to">To</Label>
                    <Input id="swap-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="color/accent/" list="swap-all-names" />
                </Flex>
            </Flex>
            <datalist id="swap-bound-names">{boundNames.map((n) => <option key={n} value={n} />)}</datalist>
            <datalist id="swap-all-names">{[...new Set(variables.map((v) => v.name))].slice(0, 2000).map((n) => <option key={n} value={n} />)}</datalist>

            <Flex direction="column" gap="1" style={{ ...panel, overflowY: "auto", flex: 1, minHeight: 0 }}>
                <Text weight="strong">Tokens bound in the selection ({boundNames.length})</Text>
                {boundNames.length === 0 && <Text style={muted}>None of the selected styles use tokens yet.</Text>}
                {boundNames.map((n) => {
                    const hit = from && n.startsWith(from);
                    return (
                        <Text key={n} style={{ fontFamily: "monospace", fontSize: 11, color: hit ? undefined : "var(--figma-color-text-secondary)" }}>
                            {n}{hit && to ? `  →  ${to}${n.slice(from.length)}` : ""}
                        </Text>
                    );
                })}
                {result && result.misses.length > 0 && (
                    <>
                        <Text weight="strong" style={{ marginTop: 8 }}>Not swapped ({result.misses.length})</Text>
                        {result.misses.map((m, i) => <Text key={i} style={{ fontSize: 11, color: "var(--figma-color-text-warning, #b45309)" }}>{m}</Text>)}
                    </>
                )}
            </Flex>
        </Flex>
    );
};
