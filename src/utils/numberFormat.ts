/**
 * Shortest round-tripping decimal for a number Figma gave us.
 *
 * Figma stores FLOAT variable values as 32-bit floats, but the plugin API hands
 * them back as JavaScript numbers, which are 64-bit doubles. Widening float32 to
 * float64 is exact, so the double we receive is the *exact* value of the stored
 * float32 - and most decimals a designer types are not exactly representable in
 * binary32. A designer's `732.8` is stored as the nearest float32 and comes back
 * as 732.79998779296875, so emitting `String(value)` (which prints the shortest
 * decimal that round-trips through a *double*) leaks that representation error
 * into every export.
 *
 * The fix is to print the shortest decimal that round-trips through a *float32*
 * instead: try increasing precisions and return the first candidate that maps
 * back to the same float32. For 732.79998779296875 that is `732.8`; for a value
 * that genuinely needs more digits, every shorter candidate fails the round-trip
 * check and the full-precision form is returned, so nothing is lost.
 *
 * Exponent notation and trailing zeros produced by `toPrecision` are normalised
 * away (via `parseFloat`) so the output stays human-readable - `732.8`, not
 * `7.328e+2` or `732.800`. Values that JavaScript itself prints in exponent form
 * (very large or very small magnitudes) keep that form, exactly as before.
 *
 * @param value - The raw numeric variable value
 * @returns The shortest decimal string that round-trips back to the same float32
 */
export const formatFloat32 = (value: number): string => {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const target = Math.fround(value);

  for (let precision = 1; precision <= 17; precision++) {
    const candidate = value.toPrecision(precision);
    const parsed = parseFloat(candidate);
    if (Math.fround(parsed) === target) {
      // Re-stringify through the number so "7.328e+2" / "732.800" normalise to "732.8".
      return String(parsed);
    }
  }

  return String(value);
};

/**
 * Numeric counterpart of `formatFloat32`, for export formats whose values are
 * real numbers rather than strings (JSON, JS, CSV). Returns the number the
 * shortest round-tripping decimal parses to, so `JSON.stringify` and friends
 * print `732.8` rather than `732.7999877929688`.
 *
 * @param value - The raw numeric variable value
 * @returns The cleaned number
 */
export const cleanFloat32 = (value: number): number => parseFloat(formatFloat32(value));
