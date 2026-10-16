/// <reference types="@figma/plugin-typings" />
import { getMatchingModeName } from "./variableUtils";
import { rgbToCssColor } from "./color";
import { formatFloat32 } from "./numberFormat";

/**
 * Figma's "composed" colour value: a colour plus a separate opacity, where
 * either part (or both) is a link to another variable — e.g. `palette/white`
 * at 97%. `opacity` is a percentage (97 means 97%), whether typed or linked.
 *
 * It is neither a plain colour nor a plain alias, so code that only knows
 * those two shapes reads it as a colour without channels (`#NaNNaNNaN`).
 */
export type ComposedColor = Extract<VariableValue, { opacity: unknown }>;

export const isComposedColor = (value: unknown): value is ComposedColor =>
    typeof value === "object" && value !== null && "color" in value && "opacity" in value;

export const isVariableAlias = (value: unknown): value is VariableAlias =>
    typeof value === "object" && value !== null && (value as VariableAlias).type === "VARIABLE_ALIAS";

/**
 * Follows aliases (and composed colours) down to a plain value, in the mode
 * named `modeName`. A link into another collection resolves in that
 * collection's mode of the same name, or its first mode — the same rule the
 * exporters use when they write alias references.
 */
export async function resolvePlainValue(value: VariableValue | undefined, modeName: string, depth = 0): Promise<VariableValue | undefined> {
    if (value === undefined || depth > 16) return undefined;
    if (isVariableAlias(value)) {
        const target = await figma.variables.getVariableByIdAsync(value.id);
        if (!target) return undefined;
        const collection = await figma.variables.getVariableCollectionByIdAsync(target.variableCollectionId);
        if (!collection) return undefined;
        const targetModeName = getMatchingModeName(modeName, collection);
        const mode = collection.modes.find((m) => m.name === targetModeName) ?? collection.modes[0];
        return resolvePlainValue(target.valuesByMode[mode.modeId], targetModeName, depth + 1);
    }
    if (isComposedColor(value)) return composedColorToRgba(value, modeName, depth);
    return value;
}

/** The colour a composed value renders as: the base colour with its alpha scaled by the opacity. */
export async function composedColorToRgba(value: ComposedColor, modeName: string, depth = 0): Promise<RGBA | undefined> {
    const base = await resolvePlainValue(value.color as VariableValue, modeName, depth + 1);
    if (!base || typeof base !== "object" || !("r" in base)) return undefined;
    const opacity = typeof value.opacity === "number"
        ? value.opacity
        : Number(await resolvePlainValue(value.opacity, modeName, depth + 1));
    if (!Number.isFinite(opacity)) return undefined;
    const alpha = "a" in base ? base.a : 1;
    return { r: base.r, g: base.g, b: base.b, a: alpha * Math.min(100, Math.max(0, opacity)) / 100 };
}

/**
 * For output formats that can't express "this colour at N%": the composed
 * value becomes the plain colour it renders as. Anything else passes through.
 */
export async function flattenComposedColor(value: VariableValue | undefined, modeName: string): Promise<VariableValue | undefined> {
    return isComposedColor(value) ? composedColorToRgba(value, modeName) : value;
}

/**
 * CSS for a composed colour that keeps its links: `color-mix()` with
 * transparent scales the colour's alpha by the opacity, so
 * `palette/white` at 97% becomes
 * `color-mix(in srgb, var(--palette-white) 97%, transparent)`.
 * `refFor` turns a link into the format's own `var(...)` reference.
 */
export async function composedColorToCss(value: ComposedColor, refFor: (alias: VariableAlias) => Promise<string>): Promise<string> {
    const color = isVariableAlias(value.color) ? await refFor(value.color) : rgbToCssColor(value.color as RGBA);
    const opacity = typeof value.opacity === "number"
        ? `${formatFloat32(value.opacity)}%`
        : `calc(${await refFor(value.opacity)} * 1%)`;
    return `color-mix(in srgb, ${color} ${opacity}, transparent)`;
}
