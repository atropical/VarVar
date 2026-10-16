import React, { useEffect, useMemo, useState } from "react";
import { Button, Flex, Text } from "figma-kit";
import { defaultBlur, defaultGrid, defaultLinearGradient, defaultShadow, defaultSolid, newDraft } from "../../composer/model";
import type { CatalogIndex } from "../../composer/model";
import { STYLE_KINDS, STYLE_KIND_LABELS } from "../../composer/types";
import type { CatalogVariable, ModeSelection, StyleDraft, StyleKind } from "../../composer/types";
import { StyleEditor } from "./StyleEditor";
import { OptionSelect, muted } from "./ui";

interface StyleBuilderProps {
    existing: StyleDraft[];
    variables: CatalogVariable[];
    index: CatalogIndex;
    modes: ModeSelection;
    libraryLoading: boolean;
    /** Renders the preview column for the draft being built. */
    renderPreview: (draft: StyleDraft) => React.ReactNode;
    onDraftChange: (draft: StyleDraft | null) => void;
    onAdd: (draft: StyleDraft, another: boolean) => void;
    onBatch: () => void;
    onCancel: () => void;
}

/** The first layer a new style starts with, per kind and type. */
const LAYER_TYPES: Record<Exclude<StyleKind, "TEXT">, { value: string; label: string; make: () => Paint | Effect | LayoutGrid }[]> = {
    PAINT: [
        { value: "SOLID", label: "Solid", make: defaultSolid },
        { value: "GRADIENT_LINEAR", label: "Linear gradient", make: defaultLinearGradient },
        { value: "GRADIENT_RADIAL", label: "Radial gradient", make: () => ({ ...defaultLinearGradient(), type: "GRADIENT_RADIAL" }) },
        { value: "GRADIENT_ANGULAR", label: "Angular gradient", make: () => ({ ...defaultLinearGradient(), type: "GRADIENT_ANGULAR" }) },
    ],
    EFFECT: [
        { value: "DROP_SHADOW", label: "Drop shadow", make: () => defaultShadow("DROP_SHADOW") },
        { value: "INNER_SHADOW", label: "Inner shadow", make: () => defaultShadow("INNER_SHADOW") },
        { value: "LAYER_BLUR", label: "Layer blur", make: () => defaultBlur("LAYER_BLUR") },
        { value: "BACKGROUND_BLUR", label: "Background blur", make: () => defaultBlur("BACKGROUND_BLUR") },
    ],
    GRID: [
        { value: "COLUMNS", label: "Columns", make: () => defaultGrid("COLUMNS") },
        { value: "ROWS", label: "Rows", make: () => defaultGrid("ROWS") },
        { value: "GRID", label: "Grid", make: () => defaultGrid("GRID") },
    ],
};

const build = (kind: StyleKind, layerType: string): StyleDraft => {
    const draft = newDraft(kind, "");
    if (kind === "TEXT") return draft;
    const layer = (LAYER_TYPES[kind].find((t) => t.value === layerType) ?? LAYER_TYPES[kind][0]).make();
    if (kind === "PAINT") return { ...draft, paints: [layer as Paint] };
    if (kind === "EFFECT") return { ...draft, effects: [layer as Effect] };
    return { ...draft, grids: [layer as LayoutGrid] };
};

/**
 * Builds one new style from variables: pick what it is (an effect → drop
 * shadow, say), then the variable for each of its fields — colour, X, Y,
 * blur, spread — and a name, with the live preview alongside. More layers
 * can be added in the same editor. The style goes to the drafts.
 */
export const StyleBuilder: React.FC<StyleBuilderProps> = ({
    existing, variables, index, modes, libraryLoading, renderPreview, onDraftChange, onAdd, onBatch, onCancel,
}) => {
    const [kind, setKind] = useState<StyleKind>("EFFECT");
    const [layerType, setLayerType] = useState("DROP_SHADOW");
    const [draft, setDraft] = useState<StyleDraft>(() => build("EFFECT", "DROP_SHADOW"));

    // Previews follow the draft being built; the list selection takes over again on leave.
    useEffect(() => { onDraftChange(draft); }, [draft, onDraftChange]);
    useEffect(() => () => onDraftChange(null), [onDraftChange]);

    const restart = (nextKind: StyleKind, nextType: string) => {
        setKind(nextKind);
        setLayerType(nextType);
        // Keep the name the user already typed.
        setDraft((prev) => ({ ...build(nextKind, nextType), name: prev.name }));
    };

    const name = draft.name.trim();
    const clash = useMemo(() => existing.some((d) => d.kind === draft.kind && d.name === name), [existing, draft.kind, name]);

    return (
        <Flex direction="column" gap="3" style={{ flex: 1, minHeight: 0 }}>
            <Flex gap="2" align="center" style={{ flexWrap: "wrap" }}>
                <Text style={muted}>Kind</Text>
                <OptionSelect
                    label="Style kind"
                    width={120}
                    value={kind}
                    options={STYLE_KINDS.map((k) => ({ value: k, label: STYLE_KIND_LABELS[k] }))}
                    onChange={(k) => restart(k, k === "TEXT" ? "" : LAYER_TYPES[k][0].value)}
                />
                {kind !== "TEXT" && (
                    <>
                        <Text style={muted}>Type</Text>
                        <OptionSelect
                            label="Layer type"
                            width={160}
                            value={layerType}
                            options={LAYER_TYPES[kind].map((t) => ({ value: t.value, label: t.label }))}
                            onChange={(t) => restart(kind, t)}
                        />
                    </>
                )}
                <div style={{ flex: 1 }} />
                <Button variant="text" onClick={onBatch}>Many at once from a token group…</Button>
                <Button variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button variant="secondary" disabled={!name} onClick={() => { onAdd({ ...draft, name }, true); restart(kind, layerType); }}>
                    Add and build another
                </Button>
                <Button variant="primary" disabled={!name} onClick={() => onAdd({ ...draft, name }, false)}>Add style</Button>
            </Flex>
            {!name && <Text style={{ ...muted, fontSize: 11 }}>Give the style a name to add it — use “/” to group, e.g. elevation/e2.</Text>}
            {clash && <Text style={{ fontSize: 11, color: "var(--figma-color-text-warning, #b45309)" }}>A {STYLE_KIND_LABELS[draft.kind].toLowerCase()} style named “{name}” already exists; this adds a second one.</Text>}

            <Flex gap="4" style={{ flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", paddingRight: 4 }}>
                    <StyleEditor
                        draft={draft}
                        isDeleted={false}
                        variables={variables}
                        index={index}
                        modes={modes}
                        libraryLoading={libraryLoading}
                        readOnly={false}
                        onChange={setDraft}
                    />
                </div>
                {renderPreview(draft)}
            </Flex>
        </Flex>
    );
};
