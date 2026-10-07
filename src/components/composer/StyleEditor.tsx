import React from "react";
import { Flex, Input, Text, Button, Label } from "figma-kit";
import type { CatalogIndex } from "../../composer/model";
import {
    defaultBlur, defaultGrid, defaultLinearGradient, defaultShadow, defaultSolid, effectLabel, listFields, paintLabel, refKey,
} from "../../composer/model";
import type { CatalogVariable, ModeSelection, StyleDraft } from "../../composer/types";
import { STYLE_KIND_LABELS } from "../../composer/types";
import { FieldRow, RawEditor } from "./FieldRow";
import { Check, OptionSelect, iconButton, muted, panel } from "./ui";

interface StyleEditorProps {
    draft: StyleDraft;
    isDeleted: boolean;
    variables: CatalogVariable[];
    index: CatalogIndex;
    modes: ModeSelection;
    libraryLoading: boolean;
    readOnly: boolean;
    onChange: (next: StyleDraft) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onRevert?: () => void;
}

type Layer = Paint | Effect | LayoutGrid;

const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
    "NORMAL", "DARKEN", "MULTIPLY", "LINEAR_BURN", "COLOR_BURN", "LIGHTEN", "SCREEN", "LINEAR_DODGE", "COLOR_DODGE",
    "OVERLAY", "SOFT_LIGHT", "HARD_LIGHT", "DIFFERENCE", "EXCLUSION", "HUE", "SATURATION", "COLOR", "LUMINOSITY",
].map((v) => ({ value: v as BlendMode, label: v.toLowerCase().replace(/_/g, " ") }));

const layersOf = (d: StyleDraft): Layer[] => (d.paints ?? d.effects ?? d.grids ?? []) as Layer[];

const withLayers = (d: StyleDraft, layers: Layer[]): StyleDraft => {
    if (d.kind === "PAINT") return { ...d, paints: layers as Paint[] };
    if (d.kind === "EFFECT") return { ...d, effects: layers as Effect[] };
    return { ...d, grids: layers as LayoutGrid[] };
};

const layerTitle = (d: StyleDraft, l: Layer) =>
    d.kind === "PAINT" ? paintLabel(l as Paint) : d.kind === "EFFECT" ? effectLabel(l as Effect) : ({ COLUMNS: "Columns", ROWS: "Rows", GRID: "Grid" } as const)[(l as LayoutGrid).pattern];

/** Kinds of layer the user can add, per style kind. */
const ADDABLE: Record<"PAINT" | "EFFECT" | "GRID", { label: string; make: () => Layer }[]> = {
    PAINT: [
        { label: "+ Solid", make: defaultSolid },
        { label: "+ Gradient", make: defaultLinearGradient },
    ],
    EFFECT: [
        { label: "+ Drop shadow", make: () => defaultShadow("DROP_SHADOW") },
        { label: "+ Inner shadow", make: () => defaultShadow("INNER_SHADOW") },
        { label: "+ Layer blur", make: () => defaultBlur("LAYER_BLUR") },
        { label: "+ Background blur", make: () => defaultBlur("BACKGROUND_BLUR") },
    ],
    GRID: [
        { label: "+ Columns", make: () => defaultGrid("COLUMNS") },
        { label: "+ Rows", make: () => defaultGrid("ROWS") },
        { label: "+ Grid", make: () => defaultGrid("GRID") },
    ],
};

const GRADIENT_TYPES = ["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"] as const;

/**
 * Editor for one style: name and description, its layers (add, remove,
 * reorder, show/hide, per-layer options) and every bindable field as a
 * {@link FieldRow}. Text styles get their non-bindable options too.
 */
export const StyleEditor: React.FC<StyleEditorProps> = ({
    draft, isDeleted, variables, index, modes, libraryLoading, readOnly, onChange, onDelete, onDuplicate, onRevert,
}) => {
    const disabled = readOnly || isDeleted;
    const fields = listFields(draft);
    const layers = layersOf(draft);

    const moveLayer = (i: number, delta: number) => {
        const next = [...layers];
        const [l] = next.splice(i, 1);
        next.splice(i + delta, 0, l);
        onChange(withLayers(draft, next));
    };
    const patchLayer = (i: number, patch: Partial<Layer>) => {
        const next = [...layers];
        next[i] = { ...next[i], ...patch } as Layer;
        onChange(withLayers(draft, next));
    };

    const fieldRows = (filter: (f: (typeof fields)[number]) => boolean) =>
        fields.filter(filter).map((entry) => (
            <FieldRow
                key={refKey(entry.ref)}
                draft={draft}
                entry={entry}
                variables={variables}
                index={index}
                modes={modes}
                libraryLoading={libraryLoading}
                readOnly={disabled}
                onChange={onChange}
            />
        ));

    // Layers are shown top-most first, as in Figma's panel; paints and grids are stored bottom-up.
    const topFirst = draft.kind !== "EFFECT";
    const displayOrder = layers.map((_, i) => i);
    if (topFirst) displayOrder.reverse();

    return (
        <Flex direction="column" gap="3" style={{ minWidth: 0 }}>
            <Flex gap="2" align="center">
                <Text style={muted}>{STYLE_KIND_LABELS[draft.kind]} style{draft.id ? "" : " · new"}</Text>
                <div style={{ flex: 1 }} />
                {onRevert && <Button variant="secondary" onClick={onRevert} disabled={readOnly}>Revert</Button>}
                <Button variant="secondary" onClick={onDuplicate} disabled={readOnly}>Duplicate</Button>
                <Button variant={isDeleted ? "secondary" : "destructive"} onClick={onDelete} disabled={readOnly}>
                    {isDeleted ? "Keep" : "Delete"}
                </Button>
            </Flex>
            {isDeleted && <Text style={{ color: "var(--figma-color-text-danger)" }}>Marked for deletion — applied after review.</Text>}

            <Flex direction="column" gap="1">
                <Label htmlFor="composer-style-name">Name</Label>
                <Input id="composer-style-name" value={draft.name} disabled={disabled} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
                <Text style={{ ...muted, fontSize: 11 }}>Use "/" to group, e.g. heading/xl.</Text>
            </Flex>
            <Flex direction="column" gap="1">
                <Label htmlFor="composer-style-description">Description</Label>
                <Input id="composer-style-description" value={draft.description} disabled={disabled} onChange={(e) => onChange({ ...draft, description: e.target.value })} />
            </Flex>

            {draft.kind === "TEXT" && draft.text && (
                <Flex direction="column" gap="2">
                    <Text weight="strong">Typography</Text>
                    <div>{fieldRows(() => true)}</div>
                    <Flex gap="2" align="center" style={{ flexWrap: "wrap" }}>
                        <Text style={muted}>Line height unit</Text>
                        <OptionSelect
                            label="Line height unit"
                            width={110}
                            disabled={disabled || !!draft.text.boundVariables.lineHeight}
                            value={draft.text.lineHeight.unit}
                            options={[{ value: "PIXELS", label: "px" }, { value: "PERCENT", label: "%" }, { value: "AUTO", label: "Auto" }]}
                            onChange={(unit) => onChange({
                                ...draft,
                                text: { ...draft.text!, lineHeight: unit === "AUTO" ? { unit } : { unit, value: draft.text!.lineHeight.unit === "AUTO" ? (unit === "PERCENT" ? 120 : draft.text!.fontSize * 1.2) : draft.text!.lineHeight.value } },
                            })}
                        />
                        <Text style={muted}>Letter spacing unit</Text>
                        <OptionSelect
                            label="Letter spacing unit"
                            width={90}
                            disabled={disabled || !!draft.text.boundVariables.letterSpacing}
                            value={draft.text.letterSpacing.unit}
                            options={[{ value: "PIXELS", label: "px" }, { value: "PERCENT", label: "%" }]}
                            onChange={(unit) => onChange({ ...draft, text: { ...draft.text!, letterSpacing: { ...draft.text!.letterSpacing, unit } } })}
                        />
                    </Flex>
                    <Flex gap="2" align="center" style={{ flexWrap: "wrap" }}>
                        <Text style={muted}>Case</Text>
                        <OptionSelect
                            label="Text case"
                            width={130}
                            disabled={disabled}
                            value={draft.text.textCase}
                            options={[
                                { value: "ORIGINAL", label: "As typed" }, { value: "UPPER", label: "Upper" }, { value: "LOWER", label: "Lower" },
                                { value: "TITLE", label: "Title" }, { value: "SMALL_CAPS", label: "Small caps" }, { value: "SMALL_CAPS_FORCED", label: "Forced small caps" },
                            ]}
                            onChange={(textCase) => onChange({ ...draft, text: { ...draft.text!, textCase } })}
                        />
                        <Text style={muted}>Decoration</Text>
                        <OptionSelect
                            label="Text decoration"
                            width={130}
                            disabled={disabled}
                            value={draft.text.textDecoration}
                            options={[{ value: "NONE", label: "None" }, { value: "UNDERLINE", label: "Underline" }, { value: "STRIKETHROUGH", label: "Strikethrough" }]}
                            onChange={(textDecoration) => onChange({ ...draft, text: { ...draft.text!, textDecoration } })}
                        />
                    </Flex>
                    <Flex gap="2" align="center" style={{ flexWrap: "wrap" }}>
                        <Text style={muted}>Leading trim</Text>
                        <OptionSelect
                            label="Leading trim"
                            width={130}
                            disabled={disabled}
                            value={draft.text.leadingTrim}
                            options={[{ value: "NONE", label: "None" }, { value: "CAP_HEIGHT", label: "Cap height" }]}
                            onChange={(leadingTrim) => onChange({ ...draft, text: { ...draft.text!, leadingTrim } })}
                        />
                        <Text style={muted}>List spacing</Text>
                        <Input
                            type="number"
                            min="0"
                            disabled={disabled}
                            style={{ width: 64 }}
                            aria-label="List spacing"
                            value={String(draft.text.listSpacing)}
                            onChange={(e) => {
                                const n = Number(e.target.value);
                                if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange({ ...draft, text: { ...draft.text!, listSpacing: n } });
                            }}
                        />
                    </Flex>
                    <Flex gap="3" align="center" style={{ flexWrap: "wrap" }}>
                        <Flex gap="1" align="center">
                            <Check
                                label="Hanging punctuation"
                                checked={draft.text.hangingPunctuation}
                                onChange={(hangingPunctuation) => !disabled && onChange({ ...draft, text: { ...draft.text!, hangingPunctuation } })}
                            />
                            <Text>Hanging punctuation</Text>
                        </Flex>
                        <Flex gap="1" align="center">
                            <Check
                                label="Hanging list"
                                checked={draft.text.hangingList}
                                onChange={(hangingList) => !disabled && onChange({ ...draft, text: { ...draft.text!, hangingList } })}
                            />
                            <Text>Hanging list markers</Text>
                        </Flex>
                    </Flex>
                    <Text style={{ ...muted, fontSize: 11 }}>
                        OpenType features (tabular numbers, ligatures…) and underline style can't be set by plugins — Figma doesn't expose them on text styles.
                    </Text>
                    {draft.text.boundVariables.lineHeight && <Text style={{ ...muted, fontSize: 11 }}>A bound line height is always in pixels.</Text>}
                </Flex>
            )}

            {draft.kind !== "TEXT" && (
                <Flex direction="column" gap="2">
                    <Flex gap="2" align="center" style={{ flexWrap: "wrap" }}>
                        <Text weight="strong">Layers</Text>
                        <div style={{ flex: 1 }} />
                        {!disabled && ADDABLE[draft.kind].map((a) => (
                            <Button key={a.label} variant="secondary" onClick={() => {
                                // New paints and grids go on top (end of the array); new effects at the top (start).
                                onChange(withLayers(draft, draft.kind === "EFFECT" ? [a.make(), ...layers] : [...layers, a.make()]));
                            }}>
                                {a.label}
                            </Button>
                        ))}
                    </Flex>
                    {layers.length === 0 && <Text style={muted}>No layers.</Text>}
                    {displayOrder.map((i, position) => {
                        const layer = layers[i];
                        const visible = (layer as { visible?: boolean }).visible !== false;
                        const upDelta = topFirst ? 1 : -1;
                        const isPaint = draft.kind === "PAINT";
                        const isGradient = isPaint && (layer as Paint).type.startsWith("GRADIENT_");
                        const bindable = fields.some((f) => "layer" in f.ref && f.ref.layer === i);
                        return (
                            <Flex key={i} direction="column" gap="1" style={{ ...panel, opacity: visible ? 1 : 0.6 }}>
                                <Flex gap="2" align="center" style={{ flexWrap: "wrap" }}>
                                    <Text weight="strong">{layerTitle(draft, layer)}</Text>
                                    {isGradient && !disabled && (
                                        <OptionSelect
                                            label="Gradient type"
                                            width={120}
                                            value={(layer as GradientPaint).type}
                                            options={GRADIENT_TYPES.map((t) => ({ value: t, label: t.replace("GRADIENT_", "").toLowerCase() }))}
                                            onChange={(type) => patchLayer(i, { type } as Partial<GradientPaint>)}
                                        />
                                    )}
                                    {isPaint && "blendMode" in layer && !disabled && (
                                        <OptionSelect
                                            label="Blend mode"
                                            width={120}
                                            value={((layer as SolidPaint).blendMode ?? "NORMAL") as BlendMode}
                                            options={BLEND_OPTIONS}
                                            onChange={(blendMode) => patchLayer(i, { blendMode } as Partial<SolidPaint>)}
                                        />
                                    )}
                                    {isGradient && (
                                        <Flex gap="1" align="center">
                                            <Text style={muted}>Opacity</Text>
                                            <Input
                                                type="number" min="0" max="100" disabled={disabled} style={{ width: 56 }}
                                                value={String(Math.round(((layer as GradientPaint).opacity ?? 1) * 100))}
                                                onChange={(e) => patchLayer(i, { opacity: Math.min(1, Math.max(0, Number(e.target.value) / 100)) } as Partial<GradientPaint>)}
                                            />
                                        </Flex>
                                    )}
                                    {draft.kind === "GRID" && (layer as LayoutGrid).pattern !== "GRID" && !disabled && (
                                        <OptionSelect
                                            label="Alignment"
                                            width={110}
                                            value={(layer as RowsColsLayoutGrid).alignment}
                                            options={[{ value: "STRETCH", label: "Stretch" }, { value: "MIN", label: "Start" }, { value: "CENTER", label: "Centre" }, { value: "MAX", label: "End" }]}
                                            onChange={(alignment) => patchLayer(i, { alignment } as Partial<RowsColsLayoutGrid>)}
                                        />
                                    )}
                                    {draft.kind === "GRID" && (
                                        <Flex gap="1" align="center">
                                            <Text style={muted}>Colour</Text>
                                            <RawEditor
                                                value={(layer as LayoutGrid).color ?? { r: 1, g: 0, b: 0, a: 0.1 }}
                                                allowAuto={false}
                                                disabled={disabled}
                                                onChange={(color) => patchLayer(i, { color: color as RGBA } as Partial<LayoutGrid>)}
                                            />
                                        </Flex>
                                    )}
                                    <div style={{ flex: 1 }} />
                                    {!disabled && (
                                        <>
                                            <button type="button" style={iconButton} title={visible ? "Hide" : "Show"} onClick={() => patchLayer(i, { visible: !visible } as Partial<Layer>)}>
                                                {visible ? "Hide" : "Show"}
                                            </button>
                                            <button type="button" style={iconButton} title="Move up" disabled={position === 0} onClick={() => moveLayer(i, upDelta)}>↑</button>
                                            <button type="button" style={iconButton} title="Move down" disabled={position === layers.length - 1} onClick={() => moveLayer(i, -upDelta)}>↓</button>
                                            <button type="button" style={iconButton} title="Remove layer" onClick={() => onChange(withLayers(draft, layers.filter((_, j) => j !== i)))}>✕</button>
                                        </>
                                    )}
                                </Flex>
                                {bindable ? (
                                    <div>{fieldRows((f) => "layer" in f.ref && f.ref.layer === i)}</div>
                                ) : (
                                    <Text style={muted}>This layer can't take variables; it is kept exactly as it is.</Text>
                                )}
                            </Flex>
                        );
                    })}
                </Flex>
            )}
        </Flex>
    );
};
