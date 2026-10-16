import React, { useState } from "react";
import { Button, Flex, Text } from "figma-kit";
import { useComposer } from "../hooks/useComposer";
import { StyleList } from "../components/composer/StyleList";
import { StyleEditor } from "../components/composer/StyleEditor";
import { StylePreview } from "../components/composer/StylePreview";
import { ReviewPanel } from "../components/composer/ReviewPanel";
import { GeneratorPanel } from "../components/composer/GeneratorPanel";
import { FindReplacePanel } from "../components/composer/FindReplacePanel";
import { LibLibPanel } from "../components/composer/LibLibPanel";
import { StyleBuilder } from "../components/composer/StyleBuilder";
import { BetaBadge, ErrorBox, muted } from "../components/composer/ui";
import { STYLE_KIND_LABELS } from "../composer/types";
import type { StyleDraft } from "../composer/types";

export type ComposerMode = "edit" | "new" | "review" | "generate" | "find" | "liblib";
type Mode = ComposerMode;

/** Breadcrumb label per view; "edit" shows the selected style instead. */
const MODE_LABELS: Record<Exclude<Mode, "edit">, string> = {
    review: "Review changes",
    new: "New style from variables",
    generate: "Many styles from a token group",
    find: "Find & replace variables",
    liblib: "Apply LibLib snapshot",
};

const crumbStyle: React.CSSProperties = {
    all: "unset",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--figma-color-text-secondary)",
};

/**
 * Where you are: "Styles › Find & replace variables", or in the editor
 * "Styles › Text · UI › X-Large". "Styles" always leads back to the editor.
 */
const Breadcrumb: React.FC<{ mode: Mode; style: StyleDraft | null; onHome: () => void }> = ({ mode, style, onHome }) => {
    const trail: string[] = [];
    if (mode !== "edit") trail.push(MODE_LABELS[mode]);
    else if (style) {
        const parts = style.name.split("/");
        trail.push([STYLE_KIND_LABELS[style.kind], ...parts.slice(0, -1)].join(" · "), parts[parts.length - 1] || "(unnamed)");
    }
    return (
        <nav aria-label="Location" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {mode === "edit" && trail.length === 0 ? (
                <Text size="large" weight="strong">Styles</Text>
            ) : (
                <button type="button" style={crumbStyle} onClick={onHome} title="Back to the style editor">Styles</button>
            )}
            {trail.map((label, i) => (
                <React.Fragment key={i}>
                    <Text style={{ color: "var(--figma-color-text-tertiary, var(--figma-color-text-secondary))" }} aria-hidden>›</Text>
                    <Text
                        size={i === trail.length - 1 ? "large" : undefined}
                        weight={i === trail.length - 1 ? "strong" : undefined}
                        aria-current={i === trail.length - 1 ? "page" : undefined}
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: i === trail.length - 1 ? undefined : "var(--figma-color-text-secondary)" }}
                    >
                        {label}
                    </Text>
                </React.Fragment>
            ))}
        </nav>
    );
};

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
export const StyleComposer: React.FC<{ initialMode?: ComposerMode }> = ({ initialMode = "edit" }) => {
    const c = useComposer();
    const [mode, setMode] = useState<Mode>(initialMode);
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
    // The list is for picking and ticking styles; building and importing get the full width.
    const showList = mode === "edit" || mode === "find" || mode === "review";
    const renderPreviewColumn = (draft: StyleDraft) => (
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
                                    draft={draft}
                                    index={c.index}
                                    modes={c.modes}
                                    onModesChange={c.setModes}
                                    sampleText={c.sampleText}
                                    onSampleTextChange={c.setSampleText}
                                    exact={c.exact}
                                    usage={draft.id ? c.usage.get(draft.id) : undefined}
                                    onCancelUsage={() => draft.id && c.cancelUsage(draft.id)}
                                    onRecountUsage={() => draft.id && c.requestUsage(draft.id)}
                                />
                            </div>
    );
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
                <Breadcrumb mode={mode} style={selected} onHome={() => setMode("edit")} />
                <BetaBadge />
                <div style={{ flex: 1 }} />
                {mode === "edit" && !readOnly && (
                    <>
                        <Button variant="secondary" onClick={() => setMode("find")}>Find &amp; replace</Button>
                        <Button variant="secondary" onClick={() => setMode("liblib")}>Apply LibLib snapshot</Button>
                    </>
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
                {showList && <Flex direction="column" style={{ width: 240, flexShrink: 0, minHeight: 0, height: "100%" }}>
                    <StyleList
                        onNew={readOnly ? undefined : () => setMode("new")}
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
                </Flex>}

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

                {mode === "new" && (
                    <StyleBuilder
                        existing={allDrafts}
                        variables={c.catalog.variables}
                        index={c.index}
                        modes={c.modes}
                        libraryLoading={c.libraryLoading}
                        renderPreview={renderPreviewColumn}
                        onDraftChange={c.setPreviewDraft}
                        onAdd={(draft, another) => { c.addDrafts([draft]); if (!another) setMode("edit"); }}
                        onBatch={() => setMode("generate")}
                        onCancel={() => setMode("edit")}
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
                        onClose={() => setMode("new")}
                    />
                )}

                {mode === "liblib" && (
                    <LibLibPanel
                        existing={allDrafts}
                        variables={c.catalog.variables}
                        onAdd={(drafts, deleteKeys) => { c.addDrafts(drafts); c.markDeleted(deleteKeys); setMode("review"); }}
                        onClose={() => setMode("edit")}
                    />
                )}

                {mode === "find" && (
                    <FindReplacePanel
                        allDrafts={allDrafts.filter((d) => !c.deleted.has(d.key))}
                        checkedDrafts={checkedDrafts}
                        variables={c.catalog.variables}
                        collections={c.catalog.collections}
                        index={c.index}
                        onApply={(drafts) => { c.updateMany(drafts); setMode("review"); }}
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
                            {renderPreviewColumn(selected)}
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
