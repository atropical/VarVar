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
