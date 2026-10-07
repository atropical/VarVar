/// <reference types="@figma/plugin-typings" />
import { buildLocalCatalog, loadLibraryVariables } from "./catalog";
import { boundVariableIds, readLocalStyles } from "./readStyles";
import { applyOps } from "./writeStyles";
import { removePreviewFrame, renderPreview } from "./preview";
import { ComposerMessages } from "./types";
import type { Catalog, ComposerMessage, ComposerSettings, StyleDraft } from "./types";

/**
 * Sandbox side of the Style Composer. `code.ts` forwards every message whose
 * type starts with "COMPOSER." here.
 */

const SETTINGS_KEY = "varvar.composer";

const post = (message: ComposerMessage) => figma.ui.postMessage(message);

const readSettings = (): ComposerSettings => {
    try {
        const raw = figma.root.getPluginData(SETTINGS_KEY);
        if (raw) return { mappings: {}, ...JSON.parse(raw) };
    } catch {
        // Corrupt settings are not worth failing over; start fresh.
    }
    return { mappings: {} };
};

const canEdit = () => figma.editorType === "figma";

const mergeCatalogs = (local: Catalog, library: Catalog): Catalog => ({
    collections: [...local.collections, ...library.collections],
    variables: [...local.variables, ...library.variables],
    libraryError: library.libraryError,
});

async function loadState(): Promise<{ styles: StyleDraft[]; catalog: Catalog }> {
    const styles = await readLocalStyles();
    const catalog = await buildLocalCatalog(boundVariableIds(styles));
    return { styles, catalog };
}

/** Library variables are listed after the first paint, because they can take seconds. */
async function sendLibrary(local: Catalog) {
    const library = await loadLibraryVariables(local);
    post({ type: ComposerMessages.LIBRARY_LOADED, catalog: mergeCatalogs(local, library) });
}

/** Set while the composer itself is writing, so its own style changes don't count as outside edits. */
let applying = false;
let listening = false;

const listenForStyleChanges = () => {
    if (listening) return;
    listening = true;
    figma.on("stylechange", () => {
        if (!applying) post({ type: ComposerMessages.DOCUMENT_CHANGED });
    });
    figma.on("close", removePreviewFrame);
};

export async function handleComposerMessage(msg: ComposerMessage) {
    try {
        switch (msg.type) {
            case ComposerMessages.LOAD: {
                listenForStyleChanges();
                const { styles, catalog } = await loadState();
                post({ type: ComposerMessages.LOADED, styles, catalog, settings: readSettings(), canEdit: canEdit() });
                await sendLibrary(catalog);
                break;
            }
            case ComposerMessages.PREVIEW: {
                const { type: _type, ...request } = msg;
                if (!canEdit()) {
                    // Dev Mode can't create the off-canvas node the render needs.
                    post({ type: ComposerMessages.PREVIEW_RESULT, requestId: request.requestId, error: "The exact render needs the design editor; the instant preview above still applies." });
                    break;
                }
                try {
                    post({ type: ComposerMessages.PREVIEW_RESULT, ...(await renderPreview(request)) });
                } catch (error) {
                    post({
                        type: ComposerMessages.PREVIEW_RESULT,
                        requestId: request.requestId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
                break;
            }
            case ComposerMessages.USAGE: {
                const style = await figma.getStyleByIdAsync(msg.styleId);
                const consumers = style ? await style.getStyleConsumersAsync() : [];
                post({
                    type: ComposerMessages.USAGE_RESULT,
                    styleId: msg.styleId,
                    count: Math.min(consumers.length, msg.cap),
                    capped: consumers.length > msg.cap,
                });
                break;
            }
            case ComposerMessages.APPLY: {
                if (!canEdit()) throw new Error("Styles can only be changed in the Figma design editor.");
                applying = true;
                try {
                    const result = await applyOps(msg.ops);
                    const { styles, catalog } = await loadState();
                    post({ type: ComposerMessages.APPLY_RESULT, result, styles, catalog });
                    figma.notify(result.warnings.length > 0 ? `Styles updated with ${result.warnings.length} warning(s).` : "✅ Styles updated.");
                    await sendLibrary(catalog);
                } finally {
                    applying = false;
                }
                break;
            }
            case ComposerMessages.SAVE_SETTINGS:
                if (canEdit()) figma.root.setPluginData(SETTINGS_KEY, JSON.stringify(msg.settings));
                break;
        }
    } catch (error) {
        console.error(error);
        post({ type: ComposerMessages.ERROR, error: error instanceof Error ? error.message : String(error) });
    }
}
