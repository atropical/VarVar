import React, { useMemo, useState } from "react";
import { Button, Flex, Input, Label, Text } from "figma-kit";
import { FIELDS_BY_KIND } from "../../composer/fields";
import { generateStyles, generatorRoots, segmentGuesses, variablesUnder } from "../../composer/ops";
import type { GeneratorRoot } from "../../composer/ops";
import type { CatalogIndex } from "../../composer/model";
import type { CatalogVariable, ComposerSettings, StyleDraft, StyleKind } from "../../composer/types";
import { STYLE_KINDS } from "../../composer/types";
import { stylesFromCompositeTokens } from "../../composer/composite";
import { FileImportInput } from "../FileImportInput";
import { DEFAULT_ROOT_FONT_SIZE, normalizeRootFontSize } from "../../utils/units";
import { ActionTag, Check, OptionSelect, muted, panel } from "./ui";

interface GeneratorPanelProps {
    variables: CatalogVariable[];
    existing: StyleDraft[];
    index: CatalogIndex;
    settings: ComposerSettings;
    onSaveSettings: (settings: ComposerSettings) => void;
    onAdd: (drafts: StyleDraft[]) => void;
    onClose: () => void;
}

const PRESETS: Record<StyleKind, { label: string; hint: string }> = {
    PAINT: { label: "Colour styles", hint: "One colour style per colour token, named after its path." },
    TEXT: { label: "Typography", hint: "One text style per group, e.g. heading/xl/{size, line-height, weight}." },
    EFFECT: { label: "Shadows", hint: "One drop-shadow style per group, e.g. shadow/md/{x, y, blur, spread, color}." },
    GRID: { label: "Layout grids", hint: "One column grid per group, e.g. grid/desktop/{count, gutter, margin}." },
};

type Source = "variables" | "file";

const rootKey = (r: GeneratorRoot) => `${r.collectionId}::${r.prefix}`;
const IGNORE = "__ignore__";

/**
 * Builds styles from a group of tokens. The user picks what to make and from
 * which group; the field each token fills is guessed from scopes, then names,
 * shown in a table to correct, and remembered in the file for next time.
 * Output goes into the drafts, so it is previewed and reviewed like any edit.
 */
export const GeneratorPanel: React.FC<GeneratorPanelProps> = ({ variables, existing, index, settings, onSaveSettings, onAdd, onClose }) => {
    const [source, setSource] = useState<Source>("variables");
    const [fileNames, setFileNames] = useState<string[]>([]);
    const [fileContents, setFileContents] = useState<string[]>([]);
    const [rootFontSize, setRootFontSize] = useState(String(DEFAULT_ROOT_FONT_SIZE));
    const [namePrefix, setNamePrefix] = useState("");
    const [kind, setKind] = useState<StyleKind>("TEXT");
    const [rootId, setRootId] = useState<string>("");
    const [template, setTemplate] = useState("{path}");
    const [overrides, setOverrides] = useState<{ [segment: string]: string }>({});
    const [excluded, setExcluded] = useState<Set<string>>(new Set());

    const learnt = settings.mappings[kind] ?? {};

    const roots = useMemo(() => {
        const fit = (v: CatalogVariable) => (kind === "PAINT" ? v.resolvedType === "COLOR" : FIELDS_BY_KIND[kind].some((f) => f.resolvedTypes.includes(v.resolvedType)));
        return generatorRoots(variables.filter((v) => !v.unimported && fit(v)));
    }, [variables, kind]);

    const root = roots.find((r) => rootKey(r) === rootId) ?? roots[0];
    const vars = useMemo(() => (root ? variablesUnder(variables, root) : []), [variables, root]);
    const segments = useMemo(() => (kind === "PAINT" ? [] : segmentGuesses(kind, vars, learnt)), [kind, vars, learnt]);

    const mapping = useMemo(() => {
        const m: { [segment: string]: string } = {};
        for (const s of segments) {
            const chosen = overrides[s.segment] ?? s.field ?? IGNORE;
            m[s.segment] = chosen === IGNORE ? "" : chosen;
        }
        return m;
    }, [segments, overrides]);

    const composite = useMemo(
        () => (source === "file" && fileContents.length > 0
            ? stylesFromCompositeTokens({ files: fileContents, variables, index, existing, rootFontSize: normalizeRootFontSize(rootFontSize), namePrefix })
            : null),
        [source, fileContents, variables, index, existing, rootFontSize, namePrefix],
    );

    const generated = useMemo(() => {
        if (source === "file") return composite?.styles ?? [];
        return root ? generateStyles({ kind, root, mapping, nameTemplate: template, variables, existing, index }) : [];
    }, [source, composite, kind, root, mapping, template, variables, existing, index]);

    const fieldOptions = [{ value: IGNORE, label: "Ignore" }, ...FIELDS_BY_KIND[kind].map((f) => ({ value: f.id, label: f.label }))];
    const chosen = generated.filter((g) => !excluded.has(g.draft.name));

    const add = () => {
        if (source === "variables" && Object.keys(overrides).length > 0) {
            onSaveSettings({ ...settings, mappings: { ...settings.mappings, [kind]: { ...learnt, ...Object.fromEntries(Object.keys(overrides).map((s) => [s, mapping[s]])) } } });
        }
        onAdd(chosen.map((g) => g.draft));
        onClose();
    };

    return (
        <Flex direction="column" gap="3" style={{ flex: 1, minHeight: 0 }}>
            <Flex gap="2" align="center">
                <Text size="large" weight="strong">Generate styles from tokens</Text>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" disabled={chosen.length === 0} onClick={add}>
                    Add {chosen.length} to drafts
                </Button>
            </Flex>
            <Text style={muted}>Generated styles land in your drafts to preview and tweak; nothing is written until you review and apply.</Text>

            <Flex gap="2" align="center">
                <Label>Source</Label>
                <OptionSelect
                    label="Source"
                    width={220}
                    value={source}
                    options={[{ value: "variables", label: "Variables in this file" }, { value: "file", label: "DTCG token file (composites)" }]}
                    onChange={(v) => { setSource(v); setExcluded(new Set()); }}
                />
            </Flex>

            {source === "file" && (
                <Flex direction="column" gap="2">
                    <Text style={{ ...muted, fontSize: 11 }}>
                        Every <code>typography</code> token becomes a text style and every <code>shadow</code> token an effect style, named after its path.
                        Sub-values that reference a token ({"{color.shadow}"} or VarVar's $.Collection.Mode.path) are bound to the variable of that name in this file; literals are written as they are.
                    </Text>
                    <FileImportInput fileNames={fileNames} onFilesSelected={(names, contents) => { setFileNames(names); setFileContents(contents); setExcluded(new Set()); }} />
                    <Flex gap="3" align="end" style={{ flexWrap: "wrap" }}>
                        <Flex direction="column" gap="1">
                            <Label htmlFor="generator-prefix">Name prefix</Label>
                            <Input id="generator-prefix" value={namePrefix} onChange={(e) => setNamePrefix(e.target.value)} placeholder="e.g. brand/" style={{ width: 180 }} />
                        </Flex>
                        <Flex direction="column" gap="1">
                            <Label htmlFor="generator-root-font-size">Root font size (rem/em)</Label>
                            <Input id="generator-root-font-size" type="number" min="1" value={rootFontSize} onChange={(e) => setRootFontSize(e.target.value)} style={{ width: 100 }} />
                        </Flex>
                    </Flex>
                    {composite && (
                        <Text style={muted}>
                            Found {composite.counts.typography} typography and {composite.counts.shadow} shadow token{composite.counts.shadow === 1 ? "" : "s"}.
                        </Text>
                    )}
                    {composite && composite.warnings.length > 0 && (
                        <details>
                            <summary style={{ cursor: "pointer" }}>{composite.warnings.length} file warning{composite.warnings.length === 1 ? "" : "s"}</summary>
                            {composite.warnings.map((w, i) => <Text key={i} style={{ display: "block", fontSize: 11 }}>{w}</Text>)}
                        </details>
                    )}
                </Flex>
            )}

            {source === "variables" && (<>
            <Flex gap="3" style={{ flexWrap: "wrap" }} align="end">
                <Flex direction="column" gap="1">
                    <Label>Make</Label>
                    <OptionSelect
                        label="Style kind"
                        width={160}
                        value={kind}
                        options={STYLE_KINDS.map((k) => ({ value: k, label: PRESETS[k].label }))}
                        onChange={(k) => { setKind(k); setOverrides({}); setExcluded(new Set()); setRootId(""); }}
                    />
                </Flex>
                <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 220 }}>
                    <Label>From group</Label>
                    {roots.length > 0 ? (
                        <OptionSelect
                            label="Token group"
                            width={320}
                            value={root ? rootKey(root) : ""}
                            options={roots.map((r) => ({ value: rootKey(r), label: `${r.collectionName} / ${r.prefix || "(all)"}` }))}
                            onChange={(v) => { setRootId(v); setExcluded(new Set()); }}
                        />
                    ) : (
                        <Text style={muted}>No local variables of a fitting type.</Text>
                    )}
                </Flex>
                <Flex direction="column" gap="1">
                    <Label htmlFor="generator-template">Style name</Label>
                    <Input id="generator-template" value={template} onChange={(e) => setTemplate(e.target.value)} style={{ width: 180 }} />
                </Flex>
            </Flex>
            <Text style={{ ...muted, fontSize: 11 }}>
                {PRESETS[kind].hint} In the name, {"{path}"} is the group's path below the chosen group and {"{name}"} its last part — e.g. "typography/{"{path}"}".
            </Text>

            </>)}

            <Flex gap="3" style={{ flex: 1, minHeight: 0 }}>
                {source === "variables" && kind !== "PAINT" && (
                    <Flex direction="column" gap="1" style={{ ...panel, width: 300, overflowY: "auto" }}>
                        <Text weight="strong">Token → field</Text>
                        <Text style={{ ...muted, fontSize: 11 }}>Guessed from scopes, then names. Corrections are remembered in this file.</Text>
                        {segments.length === 0 && <Text style={muted}>No tokens under this group.</Text>}
                        {segments.map((s) => (
                            <Flex key={s.segment} gap="2" align="center">
                                <Text style={{ flex: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }} title={s.segment}>
                                    {s.segment} <span style={muted}>×{s.count}</span>
                                </Text>
                                <OptionSelect
                                    label={`Field for ${s.segment}`}
                                    width={130}
                                    value={overrides[s.segment] ?? s.field ?? IGNORE}
                                    options={fieldOptions}
                                    onChange={(v) => setOverrides({ ...overrides, [s.segment]: v })}
                                />
                            </Flex>
                        ))}
                    </Flex>
                )}
                <Flex direction="column" gap="2" style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
                    <Text weight="strong">Result ({generated.length})</Text>
                    {generated.length === 0 && (
                        <Text style={muted}>
                            {source === "file" ? (fileContents.length ? "No typography or shadow tokens in the file." : "Choose a token file.") : "Nothing to generate — map at least one token to a field."}
                        </Text>
                    )}
                    {generated.map((g) => (
                        <Flex key={g.draft.key} direction="column" gap="1" style={panel}>
                            <Flex gap="2" align="center">
                                <Check
                                    checked={!excluded.has(g.draft.name)}
                                    onChange={(on) => {
                                        const next = new Set(excluded);
                                        if (on) next.delete(g.draft.name); else next.add(g.draft.name);
                                        setExcluded(next);
                                    }}
                                    label={`Include ${g.draft.name}`}
                                />
                                <ActionTag action={g.action} />
                                <Text weight="strong">{g.draft.name}</Text>
                            </Flex>
                            {g.bound.map((b) => <Text key={b} style={{ fontSize: 11, fontFamily: "monospace", marginLeft: 8 }}>{b}</Text>)}
                            {g.warnings.length > 0 && (
                                <details style={{ marginLeft: 8 }}>
                                    <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--figma-color-text-warning, #b45309)" }}>
                                        {g.warnings.length} token{g.warnings.length === 1 ? "" : "s"} skipped
                                    </summary>
                                    {g.warnings.map((w) => <Text key={w} style={{ display: "block", fontSize: 11, color: "var(--figma-color-text-warning, #b45309)" }}>{w}</Text>)}
                                </details>
                            )}
                        </Flex>
                    ))}
                </Flex>
            </Flex>
        </Flex>
    );
};
