import type React from "react";
import type { TextProps } from "./types";
import { isBlur, isShadow, weightFromStyle } from "./model";

/**
 * Instant previews: a resolved draft (every binding already replaced by its
 * value) turned into CSS. Anything CSS can't reproduce faithfully is reported
 * in `approximations`, so the UI can say the instant preview is approximate
 * and point at the exact render.
 */
export interface CssPreview {
    style: React.CSSProperties;
    approximations: string[];
}

const rgba = (c: RGB | RGBA, opacity = 1) => {
    const a = ("a" in c ? c.a : 1) * opacity;
    return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${+a.toFixed(3)})`;
};

const BLEND_MODES: Partial<Record<BlendMode, string>> = {
    NORMAL: "normal", PASS_THROUGH: "normal", DARKEN: "darken", MULTIPLY: "multiply", COLOR_BURN: "color-burn",
    LIGHTEN: "lighten", SCREEN: "screen", COLOR_DODGE: "color-dodge", OVERLAY: "overlay", SOFT_LIGHT: "soft-light",
    HARD_LIGHT: "hard-light", DIFFERENCE: "difference", EXCLUSION: "exclusion", HUE: "hue", SATURATION: "saturation",
    COLOR: "color", LUMINOSITY: "luminosity",
};

/** Inverts Figma's 2×3 gradient transform, so handle positions can be read in the unit square. */
const invert = (t: Transform): Transform => {
    const [[a, b, c], [d, e, f]] = t;
    const det = a * e - b * d || 1;
    return [
        [e / det, -b / det, (b * f - c * e) / det],
        [-d / det, a / det, (c * d - a * f) / det],
    ];
};
const apply = (t: Transform, x: number, y: number) => ({ x: t[0][0] * x + t[0][1] * y + t[0][2], y: t[1][0] * x + t[1][1] * y + t[1][2] });

const stopsCss = (p: GradientPaint, scale = 100) =>
    p.gradientStops.map((s) => `${rgba(s.color, p.opacity ?? 1)} ${+(s.position * scale).toFixed(2)}%`).join(", ");

const gradientCss = (p: GradientPaint, approximations: string[]): string => {
    const inv = invert(p.gradientTransform);
    const start = apply(inv, 0, 0.5);
    const end = apply(inv, 1, 0.5);
    const centre = apply(inv, 0.5, 0.5);
    switch (p.type) {
        case "GRADIENT_LINEAR": {
            const angle = (Math.atan2(end.x - start.x, -(end.y - start.y)) * 180) / Math.PI;
            return `linear-gradient(${angle.toFixed(1)}deg, ${stopsCss(p)})`;
        }
        case "GRADIENT_RADIAL":
            return `radial-gradient(ellipse at ${(centre.x * 100).toFixed(1)}% ${(centre.y * 100).toFixed(1)}%, ${stopsCss(p)})`;
        case "GRADIENT_ANGULAR": {
            const angle = (Math.atan2(end.x - centre.x, -(end.y - centre.y)) * 180) / Math.PI;
            return `conic-gradient(from ${angle.toFixed(1)}deg at ${(centre.x * 100).toFixed(1)}% ${(centre.y * 100).toFixed(1)}%, ${stopsCss(p)})`;
        }
        case "GRADIENT_DIAMOND":
            approximations.push("Diamond gradients are drawn as radial ones.");
            return `radial-gradient(circle at ${(centre.x * 100).toFixed(1)}% ${(centre.y * 100).toFixed(1)}%, ${stopsCss(p)})`;
    }
};

export const paintsToCss = (paints: Paint[]): CssPreview => {
    const approximations: string[] = [];
    const layers: string[] = [];
    const blends: string[] = [];
    // Figma lists paints bottom-up; CSS backgrounds are top-down.
    for (const p of [...paints].reverse()) {
        if (p.visible === false) continue;
        let layer: string;
        if (p.type === "SOLID") {
            const c = rgba(p.color, p.opacity ?? 1);
            layer = `linear-gradient(${c}, ${c})`;
        } else if (p.type.startsWith("GRADIENT_")) {
            layer = gradientCss(p as GradientPaint, approximations);
        } else {
            approximations.push(`${p.type.toLowerCase()} fills can't be drawn here; see the exact render.`);
            layer = "repeating-linear-gradient(45deg, rgba(128,128,128,.35) 0 6px, transparent 6px 12px)";
        }
        const blend = p.blendMode ? BLEND_MODES[p.blendMode] : "normal";
        if (!blend) approximations.push(`Blend mode ${p.blendMode} has no CSS equivalent.`);
        layers.push(layer);
        blends.push(blend ?? "normal");
    }
    return {
        style: { backgroundImage: layers.join(", ") || "none", backgroundBlendMode: blends.join(", ") },
        approximations,
    };
};

export const effectsToCss = (effects: Effect[]): CssPreview => {
    const approximations: string[] = [];
    const shadows: string[] = [];
    const filters: string[] = [];
    const backdrop: string[] = [];
    // Figma's first effect is painted on top, matching CSS's first box-shadow.
    for (const e of effects) {
        if (!e.visible) continue;
        if (isShadow(e)) {
            shadows.push(`${e.type === "INNER_SHADOW" ? "inset " : ""}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread ?? 0}px ${rgba(e.color)}`);
            if (e.blendMode !== "NORMAL") approximations.push("Shadow blend modes are ignored here.");
        } else if (isBlur(e)) {
            // Figma's blur radius is roughly twice CSS's standard deviation.
            const css = `blur(${e.radius / 2}px)`;
            if (e.type === "LAYER_BLUR") filters.push(css);
            else backdrop.push(css);
            if (e.blurType === "PROGRESSIVE") approximations.push("Progressive blur is drawn as a uniform blur.");
        } else {
            approximations.push(`${e.type.toLowerCase()} effects can't be drawn here; see the exact render.`);
        }
    }
    return {
        style: {
            boxShadow: shadows.join(", ") || undefined,
            filter: filters.join(" ") || undefined,
            backdropFilter: backdrop.join(" ") || undefined,
        },
        approximations,
    };
};

const TEXT_CASE: Partial<Record<TextCase, React.CSSProperties>> = {
    UPPER: { textTransform: "uppercase" },
    LOWER: { textTransform: "lowercase" },
    TITLE: { textTransform: "capitalize" },
    SMALL_CAPS: { fontVariant: "small-caps" },
    SMALL_CAPS_FORCED: { fontVariant: "all-small-caps" },
};

export const textToCss = (t: TextProps): CssPreview => {
    const approximations: string[] = [];
    const lineHeight =
        t.lineHeight.unit === "AUTO" ? "normal" : t.lineHeight.unit === "PERCENT" ? `${t.lineHeight.value}%` : `${t.lineHeight.value}px`;
    const letterSpacing =
        t.letterSpacing.unit === "PERCENT" ? `${t.letterSpacing.value / 100}em` : `${t.letterSpacing.value}px`;
    if (typeof document !== "undefined" && document.fonts && !document.fonts.check(`16px "${t.fontName.family}"`)) {
        approximations.push(`"${t.fontName.family}" isn't installed on this computer, so a fallback font is shown.`);
    }
    if (t.leadingTrim !== "NONE") approximations.push("Leading trim isn't shown here.");
    return {
        style: {
            fontFamily: `"${t.fontName.family}", system-ui, sans-serif`,
            fontWeight: weightFromStyle(t.fontName.style),
            fontStyle: /italic|oblique/i.test(t.fontName.style) ? "italic" : "normal",
            fontSize: `${t.fontSize}px`,
            lineHeight,
            letterSpacing,
            textIndent: t.paragraphIndent ? `${t.paragraphIndent}px` : undefined,
            textDecoration: t.textDecoration === "UNDERLINE" ? "underline" : t.textDecoration === "STRIKETHROUGH" ? "line-through" : undefined,
            ...TEXT_CASE[t.textCase],
        },
        approximations,
    };
};

export const colorCss = (c: RGB | RGBA, opacity = 1) => rgba(c, opacity);
