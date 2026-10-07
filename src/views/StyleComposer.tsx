import React, { useState } from "react";
import { Button, Flex, Text } from "figma-kit";
import { useComposer } from "../hooks/useComposer";
import { StyleList } from "../components/composer/StyleList";
import { StyleEditor } from "../components/composer/StyleEditor";
import { StylePreview } from "../components/composer/StylePreview";
import { ReviewPanel } from "../components/composer/ReviewPanel";
import { GeneratorPanel } from "../components/composer/GeneratorPanel";
import { BulkSwapPanel } from "../components/composer/BulkSwapPanel";
import { BetaBadge, ErrorBox, muted } from "../components/composer/ui";
import { STYLE_KINDS, STYLE_KIND_LABELS } from "../composer/types";
import type { StyleDraft } from "../composer/types";

type Mode = "edit" | "review" | "generate" | "swap";

const Banner: React.FC<{ tone?: "info" | "warning"; children: React.ReactNode }> = ({ tone = "info", children }) => (
    <Flex
        gap="2"
        align="center"
        style={{
            padding: "6px 8px",
            borderRadius: 4,
            background: tone === "warning" ? "rgba(234, 179, 8, 0.15)" : "var(--figma-color-bg-secondary)",
            flexWrap: "wrap",
        }}
    >
        {children}
    </Flex>
);

/**
 * Style Composer (BETA): browse every local style, bind or swap the tokens
 * behind each field, preview the result exactly as Figma renders it (per
 * mode), generate new styles from token groups, and apply everything after a
 * dry-run review.
 */
export const StyleComposer: React.FC = () => {
    const c = useComposer();
    const [mode, setMode] = useState<Mode>("edit");
    const [choosingKind, setChoosingKind] = useState(false);
    const readOnly = !c.canEdit;

    if (!c.loaded) {
        return (
            <Flex style={{ padding: "1rem" }}>
                <Text style={muted}>Reading styles and variables…</Text>
            </Flex>
        );
    }

    const selected = c.selected;
    const checkedDrafts = [...c.checked].map((k) => c.drafts.get(k)).filter((d): d is StyleDraft => !!d);
    const pending = c.changes.length + (c.orderChanged ? 1 : 0);
    const allDrafts = c.order.map((k) => c.drafts.get(k)).filter((d): d is StyleDraft => !!d);

    return (
        <Flex direction="column" gap="3" style={{
            padding: "0.75rem 1rem",
            // `#root > *` gets flex: 1, which would let the view grow with its
            // content; pin it to the window so each column scrolls on its own.
            flex: "none",
            height: "100vh",
            // Native elements (summary, buttons, datalists) don't get figma-kit's font on their own.
            fontFamily: "var(--font-family-default)",
            boxSizing: "border-box",
            overflow: "hidden",
        }}>
            <Flex gap="2" align="center" style={{ flexWrap: "wrap" }}>
                <Text size="large" weight="strong">Compose styles</Text>
                <BetaBadge />
                <div style={{ flex: 1 }} />
                {mode === "edit" && !readOnly && (
                    choosingKind ? (
                        <>
                            {STYLE_KINDS.map((k) => (
                                <Button key={k} variant="secondary" onClick={() => { c.createStyle(k); setChoosingKind(false); }}>
                                    {STYLE_KIND_LABELS[k]}
                                </Button>
                            ))}
                            <Button variant="text" onClick={() => setChoosingKind(false)}>Cancel</Button>
                        </>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={() => setChoosingKind(true)}>New style</Button>
                            <Button variant="secondary" onClick={() => setMode("generate")}>Generate from tokens</Button>
                            <Button variant="secondary" disabled={checkedDrafts.length === 0} onClick={() => setMode("swap")}>
                                Swap tokens{checkedDrafts.length > 0 ? ` (${checkedDrafts.length})` : ""}
                            </Button>
                        </>
                    )
                )}
                {mode === "edit" && (
                    <>
                        <Button variant="secondary" disabled={pending === 0} onClick={c.discardAll}>Discard all</Button>
                        <Button variant="primary" disabled={pending === 0} onClick={() => setMode("review")}>
                            Review {pending} change{pending === 1 ? "" : "s"}
                        </Button>
                    </>
                )}
            </Flex>

            {readOnly && (
                <Banner>
                    <Text>Read-only: styles can only be changed in the Figma design editor. You can still browse and preview them here.</Text>
                </Banner>
            )}
            {c.externalChange && (
                <Banner tone="warning">
                    <Text>Styles changed in Figma since this list was loaded.</Text>
                    <Button variant="secondary" onClick={c.reload}>Reload (discards unapplied edits)</Button>
                </Banner>
            )}
            {c.catalog.libraryError && (
                <Banner tone="warning">
                    <Text>Library variables couldn't be listed: {c.catalog.libraryError}</Text>
                </Banner>
            )}
            {c.applyResult && (
                <Banner tone={c.applyResult.warnings.length > 0 ? "warning" : "info"}>
                    <Text>
                        Applied: {c.applyResult.created} created, {c.applyResult.updated} updated, {c.applyResult.deleted} deleted{c.applyResult.reordered ? ", order updated" : ""}.
                    </Text>
                    {c.applyResult.warnings.length > 0 && (
                        <details style={{ width: "100%" }}>
                            <summary style={{ cursor: "pointer" }}>{c.applyResult.warnings.length} warning{c.applyResult.warnings.length === 1 ? "" : "s"}</summary>
                            {c.applyResult.warnings.map((w, i) => <Text key={i} style={{ display: "block" }}>{w}</Text>)}
                        </details>
                    )}
                    <Button variant="text" onClick={() => c.setApplyResult(null)}>Dismiss</Button>
                </Banner>
            )}
            {c.error && (
                <ErrorBox>
                    {c.error} <Button variant="text" onClick={() => c.setError(null)}>Dismiss</Button>
                </ErrorBox>
            )}

            {/* Each column scrolls on its own, so the list, editor and preview stay in view. */}
            <Flex gap="4" style={{ flex: 1, minHeight: 0, alignItems: "stretch", overflow: "hidden" }}>
                <Flex direction="column" style={{ width: 240, flexShrink: 0, minHeight: 0, height: "100%" }}>
                    <StyleList
                        order={c.order}
                        drafts={c.drafts}
                        deleted={c.deleted}
                        dirtyKeys={c.dirtyKeys}
                        selectedKey={c.selectedKey}
                        checked={c.checked}
                        index={c.index}
                        onSelect={(key) => { c.setSelectedKey(key); if (mode !== "edit") setMode("edit"); }}
                        onCheckedChange={c.setChecked}
                        onMove={readOnly ? undefined : c.moveStyle}
                    />
                </Flex>

                {mode === "review" && (
                    <ReviewPanel
                        changes={c.changes}
                        orderChanged={c.orderChanged}
                        usageFor={(key) => {
                            const id = c.drafts.get(key)?.id;
                            return id ? c.usage.get(id) : undefined;
                        }}
                        applying={c.applying}
                        readOnly={readOnly}
                        onApply={c.apply}
                        onBack={() => setMode("edit")}
                        onRevert={(key) => (c.drafts.get(key)?.id ? c.revert(key) : c.toggleDelete(key))}
                    />
                )}

                {mode === "generate" && (
                    <GeneratorPanel
                        variables={c.catalog.variables}
                        existing={allDrafts}
                        index={c.index}
                        settings={c.settings}
                        onSaveSettings={c.saveSettings}
                        onAdd={c.addDrafts}
                        onClose={() => setMode("edit")}
                    />
                )}

                {mode === "swap" && (
                    <BulkSwapPanel
                        targets={checkedDrafts}
                        variables={c.catalog.variables}
                        index={c.index}
                        onApply={(drafts) => { c.updateMany(drafts); setMode("edit"); }}
                        onClose={() => setMode("edit")}
                    />
                )}

                {mode === "edit" && (
                    selected ? (
                        <>
                            <div style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", paddingRight: 4 }}>
                                <StyleEditor
                                    draft={selected}
                                    isDeleted={c.deleted.has(selected.key)}
                                    variables={c.catalog.variables}
                                    index={c.index}
                                    modes={c.modes}
                                    libraryLoading={c.libraryLoading}
                                    readOnly={readOnly}
                                    onChange={(next) => c.updateDraft(selected.key, next)}
                                    onDelete={() => c.toggleDelete(selected.key)}
                                    onDuplicate={() => c.duplicateStyle(selected.key)}
                                    onRevert={selected.id && c.dirtyKeys.has(selected.key) ? () => c.revert(selected.key) : undefined}
                                />
                            </div>
                            <div style={{
                                width: 300,
                                flexShrink: 0,
                                height: "100%",
                                overflowY: "auto",
                                boxSizing: "border-box",
                                padding: 12,
                                borderRadius: 8,
                                background: "var(--figma-color-bg-secondary)",
                            }}>
                                <StylePreview
                                    draft={selected}
                                    index={c.index}
                                    modes={c.modes}
                                    onModesChange={c.setModes}
                                    sampleText={c.sampleText}
                                    onSampleTextChange={c.setSampleText}
                                    exact={c.exact}
                                    usage={selected.id ? c.usage.get(selected.id) : undefined}
                                    onCancelUsage={() => selected.id && c.cancelUsage(selected.id)}
                                    onRecountUsage={() => selected.id && c.requestUsage(selected.id)}
                                />
                            </div>
                        </>
                    ) : (
                        <Flex direction="column" gap="2" style={{ flex: 1 }}>
                            <Text style={muted}>
                                {c.order.length === 0
                                    ? "This file has no local styles yet. Create one, or generate a set from your tokens."
                                    : "Select a style to edit it."}
                            </Text>
                        </Flex>
                    )
                )}
            </Flex>
        </Flex>
    );
};
