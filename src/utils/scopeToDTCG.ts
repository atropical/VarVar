/**
 * Maps a Figma variable scope to its DTCG $type and whether the value needs a "px" unit.
 */
const SCOPE_TO_DTCG: Partial<Record<VariableScope, { type: string; dimension: boolean }>> = {
  CORNER_RADIUS: { type: "dimension", dimension: true },
  WIDTH_HEIGHT: { type: "dimension", dimension: true },
  GAP: { type: "dimension", dimension: true },
  FONT_SIZE: { type: "dimension", dimension: true },
  LINE_HEIGHT: { type: "dimension", dimension: true },
  LETTER_SPACING: { type: "dimension", dimension: true },
  PARAGRAPH_SPACING: { type: "dimension", dimension: true },
  PARAGRAPH_INDENT: { type: "dimension", dimension: true },
  STROKE_FLOAT: { type: "dimension", dimension: true },
  EFFECT_FLOAT: { type: "dimension", dimension: true },
  OPACITY: { type: "number", dimension: false },
  FONT_WEIGHT: { type: "fontWeight", dimension: false },
  FONT_FAMILY: { type: "fontFamily", dimension: false },
  FONT_STYLE: { type: "string", dimension: false },
  TEXT_CONTENT: { type: "string", dimension: false },
  ALL_FILLS: { type: "color", dimension: false },
  FRAME_FILL: { type: "color", dimension: false },
  SHAPE_FILL: { type: "color", dimension: false },
  TEXT_FILL: { type: "color", dimension: false },
  STROKE_COLOR: { type: "color", dimension: false },
  EFFECT_COLOR: { type: "color", dimension: false },
};

/**
 * Resolves a Figma variable's scopes to a DTCG $type, given its resolved type as fallback.
 * ALL_SCOPES and unmapped/multi scopes fall back to a raw-type-derived $type.
 */
export function resolveScopedType(
  scopes: VariableScope[],
  resolvedType: VariableResolvedDataType
): string {
  const fallback =
    resolvedType === "COLOR"
      ? "color"
      : resolvedType === "BOOLEAN"
        ? "boolean"
        : resolvedType === "FLOAT"
          ? "number"
          : "string";

  if (!scopes || scopes.length === 0 || scopes.includes("ALL_SCOPES")) {
    return fallback;
  }

  const mapped = scopes
    .map((scope) => SCOPE_TO_DTCG[scope])
    .filter((entry): entry is { type: string; dimension: boolean } => entry !== undefined);

  if (mapped.length === 0) {
    return fallback;
  }

  // If every mapped scope agrees on a $type, use it; otherwise fall back.
  const [first, ...rest] = mapped;
  const allAgree = rest.every((entry) => entry.type === first.type);
  return allAgree ? first.type : fallback;
}

/**
 * Determines whether a numeric value bound to these scopes should be rendered as a
 * CSS dimension (with a "px" unit) rather than a bare number.
 */
export function isDimensionScope(scopes: VariableScope[]): boolean {
  if (!scopes || scopes.length === 0 || scopes.includes("ALL_SCOPES")) {
    return false;
  }
  return scopes.every((scope) => {
    const entry = SCOPE_TO_DTCG[scope];
    return entry !== undefined && entry.dimension === true;
  });
}

/**
 * Whether a variable's scoping is "undecided": it has no scopes at all, or it is
 * left on Figma's default ALL_SCOPES.
 */
export function isUnscoped(scopes: VariableScope[]): boolean {
  return !scopes || scopes.length === 0 || scopes.includes("ALL_SCOPES");
}

/**
 * Whether a numeric variable value should be given the export's unit.
 *
 * Two separate questions decide this, and they are answered by two separate
 * controls in the UI:
 *
 * - Variables Figma scopes as dimensions always qualify — the unit dropdown
 *   only decides *which* unit they get.
 * - Variables left on Figma's default scoping (no scopes, or ALL_SCOPES) only
 *   qualify when the user asks for it via `appendPxToUnscoped`, which is off by
 *   default. Nothing about them says they are lengths.
 *
 * A scope that maps to a non-dimension type (FONT_WEIGHT, OPACITY, …) stays
 * unitless whatever either control says — a `rem` font weight is meaningless.
 * @param scopes - The variable's Figma scopes
 * @param appendPxToUnscoped - Treat default-scoped variables as dimensions too
 */
export function shouldUnitizeNumericValue(
  scopes: VariableScope[],
  appendPxToUnscoped: boolean
): boolean {
  return isDimensionScope(scopes) || (appendPxToUnscoped && isUnscoped(scopes));
}

/**
 * The DTCG `$type` a value is actually emitted under, which has to agree with
 * the shape of the `$value` beside it.
 *
 * {@link resolveScopedType} answers from the scopes alone, which isn't enough
 * once units are optional: a FONT_SIZE-scoped variable exported with the unit
 * set to "none" is a bare number, so calling it a `dimension` would be wrong
 * (DTCG requires a `{value, unit}` object there); and a default-scoped variable
 * the user chose to unitise really is a `dimension`, not the `number` the
 * scopes imply. Only FLOAT values are affected — every other type's shape is
 * independent of units.
 * @param scopes - The variable's Figma scopes
 * @param resolvedType - The variable's resolved data type
 * @param isUnitized - Whether this value is actually being emitted with a unit
 */
export function resolveEmittedType(
  scopes: VariableScope[],
  resolvedType: VariableResolvedDataType,
  isUnitized: boolean
): string {
  const scopedType = resolveScopedType(scopes, resolvedType);
  if (resolvedType !== "FLOAT") {
    return scopedType;
  }
  if (isUnitized) {
    return "dimension";
  }
  return scopedType === "dimension" ? "number" : scopedType;
}
