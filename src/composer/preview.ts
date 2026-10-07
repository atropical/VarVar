/// <reference types="@figma/plugin-typings" />
import { applyText, bindEffects, bindPaints, newWriteContext } from "./writeStyles";
import type { PreviewRequest, PreviewResult } from "./types";

/**
 * Exact previews: the draft is applied to one hidden, off-canvas frame and
 * exported as a PNG, so what the UI shows is what Figma renders — fonts,
 * blend modes, progressive blur and all. The frame is reused for the whole
 * session and removed when the plugin closes, so the file is left as found.
 *
 * Grid styles are not rendered here: layout grids are never part of an
 * export, so the UI draws those itself.
 */

const PREVIEW_NAME = "VarVar style preview (temporary)";
const OFF_CANVAS = -100000;

let frame: FrameNode | null = null;

const ensureFrame = (): FrameNode => {
    if (frame && !frame.removed) return frame;
    frame = figma.createFrame();
    frame.name = PREVIEW_NAME;
    frame.x = OFF_CANVAS;
    frame.y = OFF_CANVAS;
    frame.locked = true;
    frame.clipsContent = true;
    return frame;
};

export const removePreviewFrame = () => {
    if (frame && !frame.removed) frame.remove();
    frame = null;
};

const resetFrame = (f: FrameNode) => {
    for (const child of [...f.children]) child.remove();
    f.layoutMode = "NONE";
    f.fills = [];
    f.effects = [];
    f.layoutGrids = [];
    f.cornerRadius = 0;
    for (const collectionId of Object.keys(f.explicitVariableModes)) {
        f.clearExplicitVariableModeForCollection(collectionId);
    }
};

const setModes = async (f: FrameNode, modes: PreviewRequest["modes"]) => {
    for (const [collectionId, modeId] of Object.entries(modes)) {
        const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId).catch(() => null);
        if (collection) {
            try {
                f.setExplicitVariableModeForCollection(collection, modeId);
            } catch {
                // A mode deleted since the catalogue was read: fall back to the default.
            }
        }
    }
};

export async function renderPreview(req: PreviewRequest): Promise<PreviewResult> {
    const { draft } = req;
    if (draft.kind === "GRID") return { requestId: req.requestId, error: "Grid styles are previewed in the plugin window only." };

    const ctx = newWriteContext();
    const f = ensureFrame();
    resetFrame(f);
    await setModes(f, req.modes);

    if (draft.kind === "PAINT") {
        f.resize(320, 120);
        const rect = figma.createRectangle();
        rect.resize(320, 120);
        rect.fills = await bindPaints(draft.paints ?? [], ctx);
        f.appendChild(rect);
    } else if (draft.kind === "EFFECT") {
        f.resize(320, 200);
        f.fills = [{ type: "SOLID", color: { r: 0.94, g: 0.94, b: 0.94 } }];
        // A striped backdrop so background blur has something to blur.
        for (let i = 0; i < 8; i++) {
            const stripe = figma.createRectangle();
            stripe.resize(20, 200);
            stripe.x = 20 + i * 40;
            stripe.fills = [{ type: "SOLID", color: { r: 0.75, g: 0.78, b: 0.85 } }];
            f.appendChild(stripe);
        }
        const card = figma.createRectangle();
        card.resize(180, 100);
        card.x = 70;
        card.y = 50;
        card.cornerRadius = 8;
        card.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.85 }];
        card.effects = await bindEffects(draft.effects ?? [], ctx);
        f.appendChild(card);
    } else if (draft.kind === "TEXT" && draft.text) {
        f.layoutMode = "VERTICAL";
        f.primaryAxisSizingMode = "AUTO";
        f.counterAxisSizingMode = "FIXED";
        f.resize(560, 10);
        const text = figma.createText();
        f.appendChild(text);
        const ok = await applyText(text, draft.text, ctx, draft.name || "Preview");
        if (!ok) return { requestId: req.requestId, error: ctx.warnings.join("\n") };
        text.characters = req.sampleText || "The quick brown fox jumps over the lazy dog";
        text.layoutAlign = "STRETCH";
        text.textAutoResize = "HEIGHT";
        text.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
    }

    const png = await f.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
    return {
        requestId: req.requestId,
        png,
        width: f.width,
        height: f.height,
        error: ctx.warnings.length > 0 ? ctx.warnings.join("\n") : undefined,
    };
}
