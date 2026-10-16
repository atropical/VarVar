import React, { useEffect, useMemo, useState } from "react";
import { Button, Flex, Input, Label, Text } from "figma-kit";
import { applyMatches, findMatches } from "../../composer/ops";
import type { FindMode, FindOptions } from "../../composer/ops";
import type { CatalogIndex } from "../../composer/model";
import type { CatalogCollection, CatalogVariable, StyleDraft } from "../../composer/types";
import { Check, OptionSelect, muted, panel } from "./ui";

interface FindReplacePanelProps {
    allDrafts: StyleDraft[];
    checkedDrafts: StyleDraft[];
    variables: CatalogVariable[];
    collections: CatalogCollection[];
    index: CatalogIndex;
    onApply: (drafts: StyleDraft[]) => void;
    onClose: () => void;
}

const MODES: { value: FindMode; label: string }[] = [
    { value: "contains", label: "Contains" },
    { value: "prefix", label: "Starts with" },
    { value: "exact", label: "Exact name" },
    { value: "regex", label: "Regex" },
];

const ANY = "__any__";

/**
 * Find & replace over the variables bound in styles: search bound variable
 * names (or broken bindings), preview every binding it would move, untick
 * any to keep, and send the rest to the drafts for the usual review.
 */
export const FindReplacePanel: React.FC<FindReplacePanelProps> = ({ allDrafts, checkedDrafts, variables, collections, index, onApply, onClose }) => {
    const [scope, setScope] = useState<"all" | "checked">(checkedDrafts.length > 0 ? "checked" : "all");
    const [opts, setOpts] = useState<FindOptions>({
        find: "",
        replace: "",
        mode: "contains",
        caseSensitive: false,
        fromCollectionId: "",
        toCollectionId: "",
        includeBroken: false,
    });
    const [skipped, setSkipped] = useState<Set<string>>(new Set());
    const set = (patch: Partial<FindOptions>) => setOpts((o) => ({ ...o, ...patch }));

    const targets = scope === "checked" ? checkedDrafts : allDrafts;
    const result = useMemo(() => findMatches(targets, opts, variables, index), [targets, opts, variables, index]);
    // A new search starts with every match kept.
    useEffect(() => setSkipped(new Set()), [opts, scope]);

    const kept = result.matches.filter((m) => m.targetId && !skipped.has(m.id));
    const problems = result.matches.filter((m) => !m.targetId).length;

    const localCollections = collections.filter((c) => !c.remote || variables.some((v) => v.collectionId === c.id && !v.unimported));
    const collectionOptions = [{ value: ANY, label: "Any collection" }, ...localCollections.map((c) => ({ value: c.id, label: c.name }))];
    const toOptions = [{ value: ANY, label: "Same collection" }, ...localCollections.map((c) => ({ value: c.id, label: c.name }))];

    return (
        <Flex direction="column" gap="3" style={{ flex: 1, minHeight: 0 }}>
            <Flex gap="2" align="center">
                <Text size="large" weight="strong">Find &amp; replace variables</Text>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" disabled={kept.length === 0} onClick={() => onApply(applyMatches(targets, kept))}>
                    Replace {kept.length}
                </Button>
            </Flex>
            <Text style={muted}>
                Searches the variable names bound in styles. Replacements land in your drafts and go through the review before anything is written.
            </Text>

            <Flex gap="3" align="end" style={{ flexWrap: "wrap" }}>
                <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 200 }}>
                    <Label htmlFor="fr-find">Find</Label>
                    <Input id="fr-find" value={opts.find} onChange={(e) => set({ find: e.target.value })} placeholder={opts.mode === "regex" ? "^color/(brand)/(\\d+)$" : "color/brand/"} />
                </Flex>
                <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 200 }}>
                    <Label htmlFor="fr-replace">Replace with</Label>
                    <Input
                        id="fr-replace"
                        value={opts.replace}
                        onChange={(e) => set({ replace: e.target.value })}
                        placeholder={opts.mode === "regex" ? "color/accent/$2" : "color/accent/"}
                        list="fr-names"
                    />
                </Flex>
                <Flex direction="column" gap="1">
                    <Label>Match</Label>
                    <OptionSelect label="Match mode" width={130} value={opts.mode} options={MODES} onChange={(mode) => set({ mode })} />
                </Flex>
            </Flex>
            <datalist id="fr-names">{[...new Set(variables.map((v) => v.name))].slice(0, 2000).map((n) => <option key={n} value={n} />)}</datalist>

            <Flex gap="3" align="center" style={{ flexWrap: "wrap" }}>
                <Flex gap="1" align="center">
                    <Text style={muted}>In</Text>
                    <OptionSelect label="Search in collection" width={160} value={opts.fromCollectionId || ANY} options={collectionOptions} onChange={(v) => set({ fromCollectionId: v === ANY ? "" : v })} />
                </Flex>
                <Flex gap="1" align="center">
                    <Text style={muted}>Bind from</Text>
                    <OptionSelect label="Replacement collection" width={160} value={opts.toCollectionId || ANY} options={toOptions} onChange={(v) => set({ toCollectionId: v === ANY ? "" : v })} />
                </Flex>
                <Flex gap="1" align="center">
                    <Check label="Match case" checked={opts.caseSensitive} onChange={(caseSensitive) => set({ caseSensitive })} />
                    <Text>Match case</Text>
                </Flex>
                <Flex gap="1" align="center">
                    <Check label="Include broken bindings" checked={opts.includeBroken} onChange={(includeBroken) => set({ includeBroken })} />
                    <Text>Include broken bindings</Text>
                </Flex>
                {checkedDrafts.length > 0 && (
                    <OptionSelect
                        label="Scope"
                        width={170}
                        value={scope}
                        options={[{ value: "checked", label: `${checkedDrafts.length} ticked style${checkedDrafts.length === 1 ? "" : "s"}` }, { value: "all", label: "All styles" }]}
                        onChange={setScope}
                    />
                )}
            </Flex>
            {opts.includeBroken && (
                <Text style={{ ...muted, fontSize: 11 }}>Broken bindings point at a variable that no longer exists; they're bound to the exact name in “Replace with”.</Text>
            )}
            {result.error && <Text style={{ color: "var(--figma-color-text-danger)" }}>{result.error}</Text>}

            <Flex direction="column" gap="1" style={{ ...panel, overflowY: "auto", flex: 1, minHeight: 0 }}>
                <Text weight="strong">
                    {result.matches.length} match{result.matches.length === 1 ? "" : "es"}
                    {problems > 0 ? ` · ${problems} without a replacement` : ""}
                </Text>
                {result.matches.length === 0 && (
                    <Text style={muted}>{opts.find || opts.includeBroken ? "No bound variables match." : "Type something to find."}</Text>
                )}
                {result.matches.map((m) => (
                    <Flex key={m.id} gap="2" align="center" style={{ padding: "2px 0", borderBottom: "1px solid var(--figma-color-border)" }}>
                        {m.targetId ? (
                            <Check
                                label={`Replace in ${m.styleName}`}
                                checked={!skipped.has(m.id)}
                                onChange={(on) => setSkipped((prev) => { const n = new Set(prev); if (on) n.delete(m.id); else n.add(m.id); return n; })}
                            />
                        ) : (
                            <span style={{ width: 16 }} />
                        )}
                        <Text style={{ width: 200, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${m.styleName} · ${m.fieldLabel}`}>
                            {m.styleName} <span style={muted}>· {m.fieldLabel}</span>
                        </Text>
                        <Text style={{ fontFamily: "monospace", fontSize: 11, flex: 1, minWidth: 0, wordBreak: "break-all" }}>
                            {m.fromName} → {m.toName || "?"}
                        </Text>
                        {m.problem && <Text style={{ fontSize: 11, color: "var(--figma-color-text-danger)", flexShrink: 0, maxWidth: 220 }}>{m.problem}</Text>}
                    </Flex>
                ))}
            </Flex>
        </Flex>
    );
};
