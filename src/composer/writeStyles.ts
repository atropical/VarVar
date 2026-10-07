/// <reference types="@figma/plugin-typings" />
import { isAlias, resolveVariable } from "./catalog";
import { TEXT_FIELDS } from "./fields";
import type { ComposerApplyResult, ComposerOps, StyleDraft, TextBindableField, TextProps } from "./types";

/**
 * Shared write context: one variable cache (so a library variable is imported
 * once per run) and one list of non-fatal warnings.
 */
export interface WriteContext {
    warnings: string[];
    variables: Map<string, Variable | null>;
}

export const newWriteContext = (): WriteContext => ({ warnings: [], variables: new Map() });

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const withoutBindings = <T extends object>(value: T): Mutable<T> => {
    const copy = { ...value } as Mutable<T> & { boundVariables?: unknown };
    delete copy.boundVariables;
    return copy;
};

const variableFor = (alias: VariableAlias | undefined, ctx: WriteContext) =>
    alias?.id ? resolveVariable(alias.id, ctx.warnings, ctx.variables) : Promise.resolve(null);

/** Rebuilds paints with their bindings applied through Figma's helpers. */
export async function bindPaints(paints: Paint[], ctx: WriteContext): Promise<Paint[]> {
    const out: Paint[] = [];
    for (const paint of paints) {
        if (paint.type === "SOLID") {
            const variable = await variableFor(paint.boundVariables?.color, ctx);
            const base = withoutBindings(paint) as SolidPaint;
            out.push(variable ? figma.variables.setBoundVariableForPaint(base, "color", variable) : base);
        } else if (paint.type.startsWith("GRADIENT_")) {
            const gradient = paint as GradientPaint;
            const stops: ColorStop[] = [];
            for (const stop of gradient.gradientStops) {
                const variable = await variableFor(stop.boundVariables?.color, ctx);
                const base = withoutBindings(stop) as ColorStop;
                stops.push(variable ? { ...base, boundVariables: { color: figma.variables.createVariableAlias(variable) } } : base);
            }
            out.push({ ...gradient, gradientStops: stops });
        } else {
            out.push(paint);
        }
    }
    return out;
}

const EFFECT_BINDABLE: VariableBindableEffectField[] = ["color", "radius", "spread", "offsetX", "offsetY"];

export async function bindEffects(effects: Effect[], ctx: WriteContext): Promise<Effect[]> {
    const out: Effect[] = [];
    for (const effect of effects) {
        if (effect.type !== "DROP_SHADOW" && effect.type !== "INNER_SHADOW" && effect.type !== "LAYER_BLUR" && effect.type !== "BACKGROUND_BLUR") {
            // Noise, texture, glass and shader effects can't take variables.
            out.push(effect);
            continue;
        }
        const bound = (effect.boundVariables ?? {}) as { [f in VariableBindableEffectField]?: VariableAlias };
        let next = withoutBindings(effect) as Effect;
        for (const field of EFFECT_BINDABLE) {
            const variable = await variableFor(bound[field], ctx);
            if (variable) next = figma.variables.setBoundVariableForEffect(next, field, variable);
        }
        out.push(next);
    }
    return out;
}

const GRID_BINDABLE: VariableBindableLayoutGridField[] = ["count", "gutterSize", "offset", "sectionSize"];

export async function bindGrids(grids: LayoutGrid[], ctx: WriteContext): Promise<LayoutGrid[]> {
    const out: LayoutGrid[] = [];
    for (const grid of grids) {
        const bound = (grid.boundVariables ?? {}) as { [f in VariableBindableLayoutGridField]?: VariableAlias };
        let next = withoutBindings(grid) as LayoutGrid;
        for (const field of GRID_BINDABLE) {
            if (grid.pattern === "GRID" && field !== "sectionSize") continue;
            const variable = await variableFor(bound[field], ctx);
            if (variable) next = figma.variables.setBoundVariableForLayoutGrid(next, field, variable);
        }
        out.push(next);
    }
    return out;
}

/** Follows aliases to the plain values a variable can take, across all of its modes. */
async function allResolvedValues(variable: Variable, depth = 0): Promise<VariableValue[]> {
    if (depth > 10) return [];
    const values: VariableValue[] = [];
    for (const value of Object.values(variable.valuesByMode)) {
        if (isAlias(value)) {
            const target = await figma.variables.getVariableByIdAsync(value.id).catch(() => null);
            if (target) values.push(...(await allResolvedValues(target, depth + 1)));
        } else {
            values.push(value);
        }
    }
    return values;
}

let availableFonts: Font[] | null = null;
const fontsOfFamily = async (family: string): Promise<FontName[]> => {
    availableFonts ??= await figma.listAvailableFontsAsync();
    return availableFonts.filter((f) => f.fontName.family === family).map((f) => f.fontName);
};

/**
 * Loads every font the text props can end up rendering with: the raw
 * fontName, and — when family, style or weight is bound — every style of every
 * family those variables resolve to in any mode, so switching modes in the
 * preview or in the canvas never hits an unloaded font.
 */
async function loadFontsFor(text: TextProps, ctx: WriteContext, label: string): Promise<boolean> {
    try {
        await figma.loadFontAsync(text.fontName);
    } catch {
        ctx.warnings.push(`${label}: font "${text.fontName.family} ${text.fontName.style}" isn't available, so the style was skipped.`);
        return false;
    }
    const families = new Set<string>([text.fontName.family]);
    const familyVar = await variableFor(text.boundVariables.fontFamily, ctx);
    if (familyVar) {
        for (const value of await allResolvedValues(familyVar)) if (typeof value === "string") families.add(value);
    }
    const fontBound = familyVar || text.boundVariables.fontStyle || text.boundVariables.fontWeight;
    if (!fontBound) return true;
    for (const family of families) {
        const fonts = await fontsOfFamily(family);
        if (fonts.length === 0) {
            ctx.warnings.push(`${label}: font family "${family}" isn't available in this editor.`);
            continue;
        }
        await Promise.all(fonts.map((f) => figma.loadFontAsync(f).catch(() => undefined)));
    }
    return true;
}

type TextTarget = TextStyle | TextNode;

/** Writes text props onto a text style or a text node, bindings last. */
export async function applyText(target: TextTarget, text: TextProps, ctx: WriteContext, label: string): Promise<boolean> {
    if (!(await loadFontsFor(text, ctx, label))) return false;
    // The target's current font must be loaded too before anything on it can change.
    if (typeof target.fontName !== "symbol") {
        await figma.loadFontAsync(target.fontName).catch(() => undefined);
    }

    const fields = TEXT_FIELDS.map((f) => f.id as TextBindableField);
    for (const field of fields) target.setBoundVariable(field, null);

    target.fontName = text.fontName;
    target.fontSize = text.fontSize;
    target.lineHeight = text.lineHeight;
    target.letterSpacing = text.letterSpacing;
    target.paragraphSpacing = text.paragraphSpacing;
    target.paragraphIndent = text.paragraphIndent;
    target.textCase = text.textCase;
    target.textDecoration = text.textDecoration;
    target.leadingTrim = text.leadingTrim;
    target.listSpacing = text.listSpacing;
    target.hangingPunctuation = text.hangingPunctuation;
    target.hangingList = text.hangingList;

    for (const field of fields) {
        const variable = await variableFor(text.boundVariables[field], ctx);
        if (!variable) continue;
        try {
            target.setBoundVariable(field, variable);
        } catch (error) {
            ctx.warnings.push(`${label}: couldn't bind ${field} to "${variable.name}" (${error instanceof Error ? error.message : String(error)}).`);
        }
    }
    return true;
}

async function writeDraft(style: BaseStyle, draft: StyleDraft, ctx: WriteContext): Promise<boolean> {
    style.name = draft.name;
    style.description = draft.description;
    switch (style.type) {
        case "PAINT":
            style.paints = await bindPaints(draft.paints ?? [], ctx);
            return true;
        case "EFFECT":
            style.effects = await bindEffects(draft.effects ?? [], ctx);
            return true;
        case "GRID":
            style.layoutGrids = await bindGrids(draft.grids ?? [], ctx);
            return true;
        case "TEXT":
            return draft.text ? applyText(style, draft.text, ctx, draft.name) : false;
    }
}

const createStyle = (draft: StyleDraft): BaseStyle => {
    switch (draft.kind) {
        case "PAINT": return figma.createPaintStyle();
        case "TEXT": return figma.createTextStyle();
        case "EFFECT": return figma.createEffectStyle();
        case "GRID": return figma.createGridStyle();
    }
};

const MOVE: Record<StyleDraft["kind"], (style: BaseStyle, after: BaseStyle | null) => void> = {
    PAINT: (s, a) => figma.moveLocalPaintStyleAfter(s as PaintStyle, a as PaintStyle | null),
    TEXT: (s, a) => figma.moveLocalTextStyleAfter(s as TextStyle, a as TextStyle | null),
    EFFECT: (s, a) => figma.moveLocalEffectStyleAfter(s as EffectStyle, a as EffectStyle | null),
    GRID: (s, a) => figma.moveLocalGridStyleAfter(s as GridStyle, a as GridStyle | null),
};

/**
 * Re-sequences styles to match the composer's list, top to bottom. Figma only
 * orders styles within one folder, so each kind + folder is sequenced on its own.
 */
async function applyOrder(order: NonNullable<ComposerOps["order"]>, written: Map<string, BaseStyle>, ctx: WriteContext) {
    const previous = new Map<string, BaseStyle | null>();
    for (const entry of order) {
        const style = written.get(entry.key) ?? (entry.id ? await figma.getStyleByIdAsync(entry.id).catch(() => null) : null);
        if (!style) continue;
        const folder = `${entry.kind}::${style.name.includes("/") ? style.name.slice(0, style.name.lastIndexOf("/")) : ""}`;
        try {
            MOVE[entry.kind](style, previous.get(folder) ?? null);
            previous.set(folder, style);
        } catch (error) {
            ctx.warnings.push(`${style.name}: couldn't be moved (${error instanceof Error ? error.message : String(error)}).`);
        }
    }
}

/**
 * Applies a reviewed set of operations. Each style is written independently,
 * so one failure (a missing font, a deleted variable) never aborts the rest.
 * The whole run is committed as a single undo step.
 */
export async function applyOps(ops: ComposerOps): Promise<ComposerApplyResult> {
    const ctx = newWriteContext();
    const result: ComposerApplyResult = { created: 0, updated: 0, deleted: 0, reordered: false, warnings: ctx.warnings };
    /** Draft key → the style it was written to, so new styles can be placed in the order too. */
    const written = new Map<string, BaseStyle>();

    for (const draft of ops.upserts) {
        try {
            if (draft.id) {
                const style = await figma.getStyleByIdAsync(draft.id);
                if (!style) {
                    ctx.warnings.push(`${draft.name}: the style no longer exists, so it was skipped.`);
                    continue;
                }
                if (await writeDraft(style, draft, ctx)) result.updated += 1;
                written.set(draft.key, style);
            } else {
                const style = createStyle(draft);
                if (await writeDraft(style, draft, ctx)) {
                    result.created += 1;
                    written.set(draft.key, style);
                } else {
                    style.remove();
                }
            }
        } catch (error) {
            ctx.warnings.push(`${draft.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    for (const id of ops.deletes) {
        const style = await figma.getStyleByIdAsync(id).catch(() => null);
        if (!style) continue;
        style.remove();
        result.deleted += 1;
    }

    if (ops.order) {
        await applyOrder(ops.order, written, ctx);
        result.reordered = true;
    }

    figma.commitUndo();
    return result;
}
