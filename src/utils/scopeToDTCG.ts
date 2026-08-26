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
 * The DTCG-predefined `fontWeight` keywords, exactly as the spec spells them.
 *
 * The spec's table is normative and case-sensitive, and we never rewrite a
 * variable's value to make it fit — so the match here is exact: no case folding
 * and no whitespace trimming. `"Bold"`, `"BOLD"` and `" bold"` are all values a
 * `fontWeight` token may not carry, and they are emitted as `string` instead,
 * unchanged.
 */
export const DTCG_FONT_WEIGHT_KEYWORDS: ReadonlySet<string> = new Set([
  "thin",
  "hairline",
  "extra-light",
  "ultra-light",
  "light",
  "normal",
  "regular",
  "book",
  "medium",
  "semi-bold",
  "demi-bold",
  "bold",
  "extra-bold",
  "ultra-bold",
  "black",
  "heavy",
  "extra-black",
  "ultra-black",
]);

/**
 * Which Figma resolved types a scope-derived DTCG `$type` can legitimately
 * describe. A scope only implies a `$type` when the value beside it can satisfy
 * that type's value rules: `dimension`/`number` need a number, `fontFamily` and
 * `string` need a string, `color` needs a colour, and `fontWeight` accepts
 * either a number or a string (narrowed further by value — see
 * {@link isConformantFontWeight}).
 *
 * Figma's own UI keeps scopes and types in step, so a mismatch means the
 * variable was built through the API or had its type changed under it. Either
 * way, the value is what it is, and the `$type` has to describe it honestly.
 */
const TYPE_TO_RESOLVED_TYPES: Record<string, VariableResolvedDataType[]> = {
  dimension: ["FLOAT"],
  number: ["FLOAT"],
  fontWeight: ["FLOAT", "STRING"],
  fontFamily: ["STRING"],
  string: ["STRING"],
  color: ["COLOR"],
};

/**
 * Whether a value may be emitted under DTCG's `fontWeight` type as-is.
 *
 * The spec allows a number in the range [1, 1000] — fractional values included,
 * since it constrains the range and not the precision — or one of the
 * predefined keywords, matched exactly. Anything else (1200, 0, -100, `NaN`,
 * `"Heavy Italic"`) is not a `fontWeight`, and is emitted under a `$type` that
 * matches its shape instead of being clamped or rewritten.
 * @param value - The variable's raw value for this mode
 */
export function isConformantFontWeight(value: VariableValue): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 1 && value <= 1000;
  }
  if (typeof value === "string") {
    return DTCG_FONT_WEIGHT_KEYWORDS.has(value);
  }
  return false;
}

/**
 * The $type a value's own data type implies, with no scope involved. Always a
 * type the value can satisfy, which makes it the safe landing place whenever a
 * scope-derived type turns out not to be.
 * @param resolvedType - The variable's resolved data type
 */
function rawTypeFallback(resolvedType: VariableResolvedDataType): string {
  return resolvedType === "COLOR"
    ? "color"
    : resolvedType === "BOOLEAN"
      ? "boolean"
      : resolvedType === "FLOAT"
        ? "number"
        : "string";
}

/**
 * Whether a value is an alias reference rather than a concrete value. An alias
 * carries no value of its own to check, so it keeps whatever `$type` its scopes
 * imply — the token it points at answers for its own conformance.
 * @param value - The variable's raw value for this mode
 */
function isAliasValue(value: VariableValue): boolean {
  return typeof value === "object" && value !== null && "type" in value && value.type === "VARIABLE_ALIAS";
}

/**
 * Resolves a Figma variable's scopes to a DTCG $type, given its resolved type as fallback.
 * ALL_SCOPES and unmapped/multi scopes fall back to a raw-type-derived $type.
 *
 * This answers from the scopes alone, so it describes what the variable is
 * *scoped to* — which is what the CSV and JS exports want in their descriptive
 * `DTCG Type` / `dtcgType` columns. A `$type` written beside a `$value` is a
 * conformance claim about that value instead, and has to agree with it; use
 * {@link resolveEmittedType} for that.
 * @param scopes - The variable's Figma scopes
 * @param resolvedType - The variable's resolved data type
 */
export function resolveScopedType(
  scopes: VariableScope[],
  resolvedType: VariableResolvedDataType
): string {
  const fallback = rawTypeFallback(resolvedType);

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
 * for a type written beside a value, in three ways:
 *
 * - Units are optional: a FONT_SIZE-scoped variable exported with the unit set
 *   to "none" is a bare number, so calling it a `dimension` would be wrong
 *   (DTCG requires a `{value, unit}` object there); and a default-scoped
 *   variable the user chose to unitise really is a `dimension`, not the
 *   `number` the scopes imply.
 * - A scope can contradict the variable's own data type — a STRING scoped to
 *   FONT_SIZE, a FLOAT scoped to FONT_FAMILY — and no value can satisfy the
 *   type its scope claims.
 * - `fontWeight` constrains the value itself, not just its shape: only numbers
 *   in [1, 1000] and the spec's predefined keywords qualify.
 *
 * In every one of those cases the value is emitted unchanged and the `$type`
 * gives way to one the value can satisfy. Nothing is clamped, rounded or
 * rewritten to fit a type.
 * @param scopes - The variable's Figma scopes
 * @param resolvedType - The variable's resolved data type
 * @param isUnitized - Whether this value is actually being emitted with a unit
 * @param value - The value being emitted, when known. Omit when there is no
 *   single value in hand; the scope-derived type is then used as-is.
 */
export function resolveEmittedType(
  scopes: VariableScope[],
  resolvedType: VariableResolvedDataType,
  isUnitized: boolean,
  value?: VariableValue
): string {
  const scopedType = conformantScopedType(scopes, resolvedType, value);
  if (resolvedType !== "FLOAT") {
    return scopedType;
  }
  if (isUnitized) {
    return "dimension";
  }
  return scopedType === "dimension" ? "number" : scopedType;
}

/**
 * The scope-derived `$type`, but only when the value can actually satisfy it —
 * otherwise the value's own raw-type fallback, which it always can.
 * @param scopes - The variable's Figma scopes
 * @param resolvedType - The variable's resolved data type
 * @param value - The value being emitted, when known
 */
function conformantScopedType(
  scopes: VariableScope[],
  resolvedType: VariableResolvedDataType,
  value?: VariableValue
): string {
  const scopedType = resolveScopedType(scopes, resolvedType);
  const fallback = rawTypeFallback(resolvedType);

  if (scopedType === fallback) {
    return scopedType;
  }

  // A scope that contradicts the variable's own data type describes nothing the
  // value can satisfy.
  const allowedResolvedTypes = TYPE_TO_RESOLVED_TYPES[scopedType];
  if (allowedResolvedTypes !== undefined && !allowedResolvedTypes.includes(resolvedType)) {
    return fallback;
  }

  if (
    scopedType === "fontWeight"
    && value !== undefined
    && !isAliasValue(value)
    && !isConformantFontWeight(value)
  ) {
    return fallback;
  }

  return scopedType;
}
