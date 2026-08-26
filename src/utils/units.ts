import { cleanFloat32, formatFloat32 } from "./numberFormat";
import type { ExportUnit } from "../types.d";

/**
 * Every unit the export dropdown offers, in the order it presents them:
 * "none" (a bare number, exactly as Figma stores it) first, then the two real
 * units.
 *
 * The list is deliberately short. `px` and `rem` are the only units the DTCG
 * `dimension` type can express, so anything else would be untranslatable the
 * moment the same values are exported as tokens; and relative units (`em`, `%`,
 * `vw`, `ch`, …) cause more trouble than they are worth — their meaning depends
 * on a context the exporter cannot see, so the number a designer set in Figma
 * would no longer be the number the consumer renders.
 */
export const EXPORT_UNITS: { value: ExportUnit; label: string }[] = [
  { value: "none", label: "None (bare number)" },
  { value: "px", label: "px" },
  { value: "rem", label: "rem" },
];

/** The unit an export uses unless the user picks another one. */
export const DEFAULT_EXPORT_UNIT: ExportUnit = "px";

/** The root font size a `rem` conversion divides by unless the user changes it. */
export const DEFAULT_ROOT_FONT_SIZE = 16;

/** A unit choice plus the root font size its `rem` conversion divides by. */
export interface UnitOptions {
  unit: ExportUnit;
  rootFontSize: number;
}

/** The unit options an export uses when the UI sends none — today's behaviour. */
export const DEFAULT_UNIT_OPTIONS: UnitOptions = {
  unit: DEFAULT_EXPORT_UNIT,
  rootFontSize: DEFAULT_ROOT_FONT_SIZE,
};

/**
 * Whether a unit is expressed relative to a font size, and so needs the raw
 * number to be divided (on export) or multiplied (on import) by a root font
 * size.
 *
 * The export dropdown only offers `rem`, but this takes a plain string and also
 * recognises `em` because the import side reads unit suffixes out of an
 * arbitrary file, which may well have been written by something other than this
 * plugin.
 * @param unit - The unit name, lower-cased
 */
export const isFontRelativeUnit = (unit: string): boolean => unit === "rem" || unit === "em";

/**
 * One number followed by one unit suffix, and nothing else — the shape every
 * unit-carrying value this plugin emits ("16px", "2rem") has. Deliberately
 * strict: anything with two numbers, an expression, or trailing text is not a
 * unit-carrying value and is left to the caller's existing handling.
 */
const NUMBER_WITH_UNIT = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(%|[A-Za-z]+)\s*$/;

/** A numeric value split into its number and its (lower-cased) unit suffix. */
export interface NumberWithUnit {
  number: number;
  unit: string;
}

/**
 * Splits a `"<number><unit>"` string into its parts, e.g. `"2rem"` into
 * `{ number: 2, unit: "rem" }`. Returns `undefined` when the string isn't
 * exactly that shape — a bare number, an alias reference, a colour or any
 * other text — so callers can keep their existing handling for those.
 *
 * Stays general over units (`pt`, `vh`, `%`, …) even though the exporter only
 * emits `px` and `rem`: this is the import side, and the file being read was
 * not necessarily written by this plugin.
 * @param raw - The raw value read out of an imported file
 */
export const parseNumberWithUnit = (raw: string): NumberWithUnit | undefined => {
  const match = NUMBER_WITH_UNIT.exec(raw);
  if (!match) return undefined;
  const number = parseFloat(match[1]);
  if (!Number.isFinite(number)) return undefined;
  return { number, unit: match[2].toLowerCase() };
};

/**
 * The DTCG `dimension` value shape: a numeric `value` plus a `unit` of
 * measurement, which the spec restricts to `"px"` or `"rem"`. The unit is
 * required even when the value is zero.
 */
export interface DtcgDimensionValue {
  value: number;
  unit: "px" | "rem";
}

/**
 * Reads the DTCG object form of a dimension — `{ "value": 16, "unit": "px" }` —
 * into the same `{ number, unit }` shape {@link parseNumberWithUnit} produces,
 * so both spellings of a dimension can be handled by one code path on import.
 * Returns `undefined` for anything that isn't that object shape.
 *
 * The `unit` is accepted as a free string rather than checked against `px`/`rem`
 * so a file carrying a unit outside the spec still parses and can be reported,
 * exactly as the string form is.
 * @param raw - The raw `$value` read out of an imported file
 */
export const parseDimensionObject = (raw: unknown): NumberWithUnit | undefined => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const candidate = raw as { value?: unknown; unit?: unknown };
  if (typeof candidate.unit !== "string") return undefined;
  const number = typeof candidate.value === "number" ? candidate.value : parseFloat(String(candidate.value ?? ""));
  if (!Number.isFinite(number)) return undefined;
  return { number, unit: candidate.unit.toLowerCase() };
};

/**
 * Reads a numeric token value in whichever shape the file spells it: the DTCG
 * object form (`{ "value": 16, "unit": "px" }`) or the string form (`"16px"`).
 * Returns `undefined` when the value carries no unit at all (a bare number, or
 * anything unparseable), leaving that to the caller.
 * @param raw - The raw `$value` read out of an imported file
 */
export const parseUnitValue = (raw: unknown): NumberWithUnit | undefined =>
  typeof raw === "string" ? parseNumberWithUnit(raw) : parseDimensionObject(raw);

/**
 * Coerces whatever the root font size input holds into a usable divisor.
 * An empty, non-numeric, zero or negative entry falls back to 16 rather than
 * producing `Infinity` or `NaN` in the exported file.
 * @param value - The raw root font size, as typed or as received over postMessage
 */
export const normalizeRootFontSize = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROOT_FONT_SIZE;
};

/**
 * Coerces an arbitrary string (e.g. one arriving over postMessage) into a known
 * unit, falling back to the default rather than emitting something unparseable.
 * @param value - The raw unit
 */
export const normalizeExportUnit = (value: unknown): ExportUnit => {
  const match = EXPORT_UNITS.find((entry) => entry.value === value);
  return match ? match.value : DEFAULT_EXPORT_UNIT;
};

/**
 * Builds the {@link UnitOptions} an exporter works with from the raw pair sent
 * by the UI.
 * @param unit - The selected unit
 * @param rootFontSize - The root font size `rem` divides by
 */
export const toUnitOptions = (unit: unknown, rootFontSize: unknown): UnitOptions => ({
  unit: normalizeExportUnit(unit),
  rootFontSize: normalizeRootFontSize(rootFontSize),
});

/**
 * The number a unit-carrying value renders as: `rem` divides by the root font
 * size (so a 32 with a root of 16 becomes 2), `px` and "none" keep the raw
 * number. Cleaned through {@link cleanFloat32} so a division never reintroduces
 * the float32 noise that function exists to strip.
 * @param value - The raw numeric variable value
 * @param options - The unit and root font size to render it with
 */
const toUnitNumber = (value: number, options: UnitOptions): number =>
  isFontRelativeUnit(options.unit)
    ? cleanFloat32(value / normalizeRootFontSize(options.rootFontSize))
    : cleanFloat32(value);

/**
 * Renders a numeric variable value with its unit, for the text formats (CSS,
 * Tailwind).
 *
 * `rem` divides by the root font size, so a 32 with a root of 16 becomes
 * "2rem"; `px` is appended to the number unchanged, and "none" emits the bare
 * number. The result goes through {@link formatFloat32} so a division never
 * reintroduces the float32 noise that function exists to strip.
 * @param value - The raw numeric variable value
 * @param options - The unit and root font size to render it with
 */
export const formatNumericValue = (value: number, options: UnitOptions): string => {
  const { unit } = options;

  if (unit === "none") {
    return formatFloat32(value);
  }
  if (isFontRelativeUnit(unit)) {
    return `${formatFloat32(value / normalizeRootFontSize(options.rootFontSize))}${unit}`;
  }
  return `${formatFloat32(value)}${unit}`;
};

/**
 * The {@link formatNumericValue} counterpart for JSON, whose values are real
 * JSON literals rather than CSS text. Three shapes are possible:
 *
 * - "none": a bare JSON number — which is also the only legal shape for a DTCG
 *   `number` token, and what these formats emitted before units existed.
 * - a unit, DTCG-compliant: the spec's `dimension` object,
 *   `{ "value": 16, "unit": "px" }`. The unit is present even when the value is
 *   zero, as the spec requires.
 * - a unit, not DTCG-compliant: the `"16px"` string earlier versions of the
 *   plugin emitted, kept as an escape hatch for consumers built against it.
 *
 * @param value - The raw numeric variable value
 * @param options - The unit and root font size to render it with
 * @param dtcgCompliant - Emit the spec's object shape rather than the legacy string
 */
export const formatDtcgNumericValue = (
  value: number,
  options: UnitOptions,
  dtcgCompliant: boolean
): string | number | DtcgDimensionValue => {
  if (options.unit === "none") {
    return cleanFloat32(value);
  }
  if (!dtcgCompliant) {
    return formatNumericValue(value, options);
  }
  return { value: toUnitNumber(value, options), unit: options.unit };
};
