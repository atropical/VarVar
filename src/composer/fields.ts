import type { CatalogVariable, StyleKind, TextBindableField } from "./types";

/**
 * Every variable-bindable field the composer knows about, keyed by an id that
 * is unique per style kind. `scopes` are the Figma scopes that mark a variable
 * as made for this field; `aliases` are the name segments the generator
 * recognises when guessing a mapping from token names.
 */
export interface FieldSpec {
    id: string;
    label: string;
    resolvedTypes: VariableResolvedDataType[];
    scopes: VariableScope[];
    aliases: string[];
}

const COLOR_SCOPES: VariableScope[] = ["ALL_FILLS", "FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR", "EFFECT_COLOR"];

export const TEXT_FIELDS: (FieldSpec & { id: TextBindableField })[] = [
    { id: "fontFamily", label: "Font family", resolvedTypes: ["STRING"], scopes: ["FONT_FAMILY"], aliases: ["font-family", "fontfamily", "family", "ff", "font"] },
    { id: "fontStyle", label: "Font style", resolvedTypes: ["STRING"], scopes: ["FONT_STYLE"], aliases: ["font-style", "fontstyle", "style"] },
    { id: "fontWeight", label: "Font weight", resolvedTypes: ["FLOAT"], scopes: ["FONT_WEIGHT"], aliases: ["font-weight", "fontweight", "weight", "fw"] },
    { id: "fontSize", label: "Font size", resolvedTypes: ["FLOAT"], scopes: ["FONT_SIZE"], aliases: ["font-size", "fontsize", "size", "fs"] },
    { id: "lineHeight", label: "Line height", resolvedTypes: ["FLOAT"], scopes: ["LINE_HEIGHT"], aliases: ["line-height", "lineheight", "leading", "lh"] },
    { id: "letterSpacing", label: "Letter spacing", resolvedTypes: ["FLOAT"], scopes: ["LETTER_SPACING"], aliases: ["letter-spacing", "letterspacing", "tracking", "ls"] },
    { id: "paragraphSpacing", label: "Paragraph spacing", resolvedTypes: ["FLOAT"], scopes: ["PARAGRAPH_SPACING"], aliases: ["paragraph-spacing", "paragraphspacing", "ps"] },
    { id: "paragraphIndent", label: "Paragraph indent", resolvedTypes: ["FLOAT"], scopes: ["PARAGRAPH_INDENT"], aliases: ["paragraph-indent", "paragraphindent", "indent", "pi"] },
];

export const PAINT_FIELDS: FieldSpec[] = [
    { id: "color", label: "Colour", resolvedTypes: ["COLOR"], scopes: COLOR_SCOPES, aliases: ["color", "colour", "fill", "value"] },
];

export const EFFECT_FIELDS: FieldSpec[] = [
    { id: "color", label: "Colour", resolvedTypes: ["COLOR"], scopes: ["EFFECT_COLOR"], aliases: ["color", "colour"] },
    { id: "offsetX", label: "X", resolvedTypes: ["FLOAT"], scopes: ["EFFECT_FLOAT"], aliases: ["x", "offset-x", "offsetx"] },
    { id: "offsetY", label: "Y", resolvedTypes: ["FLOAT"], scopes: ["EFFECT_FLOAT"], aliases: ["y", "offset-y", "offsety"] },
    { id: "radius", label: "Blur", resolvedTypes: ["FLOAT"], scopes: ["EFFECT_FLOAT"], aliases: ["blur", "radius"] },
    { id: "spread", label: "Spread", resolvedTypes: ["FLOAT"], scopes: ["EFFECT_FLOAT"], aliases: ["spread"] },
];

/** Figma has no grid-specific scopes; gap and size scopes are the closest intent. */
const GRID_SCOPES: VariableScope[] = ["GAP", "WIDTH_HEIGHT"];

export const GRID_FIELDS: FieldSpec[] = [
    { id: "count", label: "Count", resolvedTypes: ["FLOAT"], scopes: GRID_SCOPES, aliases: ["count", "columns", "cols", "rows"] },
    { id: "gutterSize", label: "Gutter", resolvedTypes: ["FLOAT"], scopes: GRID_SCOPES, aliases: ["gutter", "gutter-size", "gap"] },
    { id: "offset", label: "Margin", resolvedTypes: ["FLOAT"], scopes: GRID_SCOPES, aliases: ["offset", "margin"] },
    { id: "sectionSize", label: "Size", resolvedTypes: ["FLOAT"], scopes: GRID_SCOPES, aliases: ["size", "section-size", "width", "height", "cell"] },
];

export const FIELDS_BY_KIND: Record<StyleKind, FieldSpec[]> = {
    PAINT: PAINT_FIELDS,
    TEXT: TEXT_FIELDS,
    EFFECT: EFFECT_FIELDS,
    GRID: GRID_FIELDS,
};

export const fieldSpec = (kind: StyleKind, fieldId: string): FieldSpec | undefined =>
    FIELDS_BY_KIND[kind].find((f) => f.id === fieldId);

const isUnscoped = (v: CatalogVariable) => v.scopes.length === 0 || v.scopes.includes("ALL_SCOPES");

export type Compatibility = "scoped" | "unscoped" | "other-scope" | "incompatible";

/**
 * Whether a variable may be bound to a field: its type must fit, and it is
 * "scoped" when its scopes name the field, "unscoped" when it was left on
 * Figma's default scoping, and "other-scope" when it is explicitly scoped
 * elsewhere — still bindable (Figma allows it), so the picker offers it last.
 * Only a type mismatch is "incompatible".
 */
export const compatibility = (spec: FieldSpec, v: CatalogVariable): Compatibility => {
    if (!spec.resolvedTypes.includes(v.resolvedType)) return "incompatible";
    if (isUnscoped(v)) return "unscoped";
    if (v.scopes.some((s) => spec.scopes.includes(s))) return "scoped";
    return "other-scope";
};

const normaliseSegment = (segment: string) => segment.trim().toLowerCase().replace(/[\s_]+/g, "-");

/**
 * Guesses which field of `kind` a variable fills, from its scopes first and
 * its last name segment second. `learnt` holds the user's corrections
 * (segment → field id, or "" for "ignore") and always wins.
 */
export const guessField = (
    kind: StyleKind,
    v: CatalogVariable,
    learnt: { [segment: string]: string } = {},
): string | null => {
    const segment = normaliseSegment(v.name.split("/").pop() ?? v.name);
    if (segment in learnt) return learnt[segment] || null;

    const fields = FIELDS_BY_KIND[kind].filter((f) => f.resolvedTypes.includes(v.resolvedType));
    if (!isUnscoped(v)) {
        const byScope = fields.filter((f) => v.scopes.some((s) => f.scopes.includes(s)));
        // A scope only decides when it points at exactly one field; EFFECT_FLOAT
        // fits four effect fields, so the name has to break that tie.
        if (byScope.length === 1) return byScope[0].id;
        const byScopeAndName = byScope.find((f) => f.aliases.includes(segment));
        if (byScopeAndName) return byScopeAndName.id;
    }
    const byName = fields.find((f) => f.aliases.includes(segment) || normaliseSegment(f.id) === segment);
    if (byName) return byName.id;
    return null;
};

export { normaliseSegment };
