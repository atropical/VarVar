import React, { useMemo, useState } from "react";
import { Button, Flex, Text } from "figma-kit";
import { FileImportInput } from "../FileImportInput";
import { ExternalLink } from "../ExternalLink";
import { LIBLIB_PLUGIN_URL, LIBLIB_REPO_URL } from "../../composer/liblib";
import { SUPPORTED_LIBLIB_SCHEMAS, planFromLibLib } from "../../composer/liblib";
import { newDraftKey } from "../../composer/model";
import type { CatalogVariable, StyleDraft } from "../../composer/types";
import { Check, ErrorBox, muted, panel } from "./ui";

interface LibLibPanelProps {
    existing: StyleDraft[];
    variables: CatalogVariable[];
    onAdd: (drafts: StyleDraft[], deleteKeys: string[]) => void;
    onClose: () => void;
}

/**
 * Applies the styles of a LibLib library snapshot: each record updates the
 * style with the same key (renaming it if the name changed) or creates a new
 * one, with its variable bindings restored by name. The result lands in the
 * drafts and goes through the normal review before anything is written.
 */
export const LibLibPanel: React.FC<LibLibPanelProps> = ({ existing, variables, onAdd, onClose }) => {
    const [fileNames, setFileNames] = useState<string[]>([]);
    const [text, setText] = useState<string | null>(null);
    const [deleteMissing, setDeleteMissing] = useState(false);

    const result = useMemo(() => {
        if (!text) return null;
        try {
            return { plan: planFromLibLib(text, existing, variables, newDraftKey) };
        } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }, [text, existing, variables]);
    const plan = result && "plan" in result ? result.plan : null;

    return (
        <Flex direction="column" gap="3" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <Flex gap="2" align="center">
                <Text size="large" weight="strong">Apply LibLib snapshot</Text>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button
                    variant="primary"
                    disabled={!plan || (plan.drafts.length === 0 && !(deleteMissing && plan.missing.length > 0))}
                    onClick={() => plan && onAdd(plan.drafts, deleteMissing ? plan.missing : [])}
                >
                    Add to drafts
                </Button>
            </Flex>
            <Flex direction="column" gap="1" style={panel}>
                <Text weight="strong">What is LibLib?</Text>
                <Text style={muted}>
                    <ExternalLink href={LIBLIB_PLUGIN_URL}>LibLib</ExternalLink> is a companion Figma plugin that exports a design system —
                    every component, style and variable — as a deterministic snapshot you commit to your repo, so <code>git diff</code> becomes its
                    changelog and agents can read it. Together they close the loop: export a snapshot with LibLib, edit its styles (by hand or
                    with an agent), apply it here, then run LibLib's diff to confirm the file matches.
                </Text>
                <Text style={{ ...muted, fontSize: 11 }}>
                    In LibLib: run <strong>Export Library Snapshot…</strong> in the library file and choose <strong>JSON</strong>.{" "}
                    <ExternalLink href={LIBLIB_REPO_URL}>Source and docs</ExternalLink>
                </Text>
            </Flex>
            <Text style={muted}>
                Pick a library snapshot exported by LibLib as JSON. Each style record updates the style with the same key — renaming it if
                its name changed — or creates a new one, and its variables are bound again by name. Everything lands in your drafts for review.
            </Text>
            <Text style={{ ...muted, fontSize: 11 }}>
                Supported LibLib snapshot schema{SUPPORTED_LIBLIB_SCHEMAS.length === 1 ? "" : "s"}: {SUPPORTED_LIBLIB_SCHEMAS.join(", ")}.
            </Text>

            <FileImportInput
                fileNames={fileNames}
                onFilesSelected={(names, contents) => { setFileNames(names.slice(0, 1)); setText(contents[0] ?? null); }}
            />

            {result && "error" in result && <ErrorBox>{result.error}</ErrorBox>}

            {plan && (
                <Flex direction="column" gap="2" style={panel}>
                    <Text weight="strong">{plan.fileName ? `From "${plan.fileName}"` : "Snapshot"} · {plan.schema}</Text>
                    <Text>
                        {plan.counts.update} to update ({plan.counts.rename} renamed), {plan.counts.create} to create.
                    </Text>
                    {plan.missing.length > 0 && (
                        <Flex gap="2" align="center">
                            <Check checked={deleteMissing} onChange={setDeleteMissing} label="Delete styles not in the snapshot" />
                            <Text>
                                Also delete the {plan.missing.length} style{plan.missing.length === 1 ? "" : "s"} in this file that the snapshot doesn't include
                            </Text>
                        </Flex>
                    )}
                    {plan.warnings.length > 0 && (
                        <details>
                            <summary style={{ cursor: "pointer", color: "var(--figma-color-text-warning, #b45309)" }}>
                                {plan.warnings.length} warning{plan.warnings.length === 1 ? "" : "s"}
                            </summary>
                            {plan.warnings.map((w, i) => <Text key={i} style={{ display: "block", fontSize: 11 }}>{w}</Text>)}
                        </details>
                    )}
                </Flex>
            )}
        </Flex>
    );
};
