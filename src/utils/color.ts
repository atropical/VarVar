import { cleanFloat32 } from "./numberFormat";
import { isDtcgColorObject, parseDtcgColorValue } from "./colorSpaces";
import type { DtcgColorValue, ParsedTokenColor } from "./colorSpaces";
import type { CssColor } from "../types";

/**
 * Converts an RGBA color to a CSS color string
 * @param {RGBA} param0 - The RGBA color to convert
 * @returns {CssColor} The CSS color string
 */
export const rgbToCssColor = ({ r, g, b, a = 1 }: RGBA): CssColor => {
  if (a !== 1) {
    return `rgba(${[r, g, b]
      .map((n) => Math.round(n * 255))
      .join(", ")}, ${a.toFixed(2)})`;
  }

  /**
   * Converts a number to a hex string
   * @param {number} value - The number to convert
   * @returns {string} The hex string
   */
  const toHex = (value: number) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.padStart(2, "0");
  };

  /**
   * Converts the RGB values to a hex string
   * @returns {string} The hex string
   */
  const hex = [toHex(r), toHex(g), toHex(b)].join("");
  return `#${hex}`;
};

/**
 * Parses a CSS color string (as produced by `rgbToCssColor`: `#rrggbb`/`#rgb`
 * hex, or `rgba(r, g, b, a)`) back into an RGBA value with 0-1 float channels.
 * @param {string} css - The CSS color string to parse
 * @returns {RGBA} The parsed RGBA color
 */
export const cssColorToRgba = (css: string): RGBA => {
  const trimmed = css.trim();

  const rgbaMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(trimmed);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    return {
      r: parseFloat(r) / 255,
      g: parseFloat(g) / 255,
      b: parseFloat(b) / 255,
      a: a !== undefined ? parseFloat(a) : 1,
    } as RGBA;
  }

  const hexMatch = /^#([0-9a-f]{3,8})$/i.exec(trimmed);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a } as RGBA;
  }

  throw new Error(`Unrecognized CSS color value: "${css}"`);
};

/**
 * Renders a Figma colour as the DTCG Color Module's `$value` object.
 *
 * The module (https://www.designtokens.org/TR/2025.10/color/, §4.1) requires
 * `$value` to be an object — a hex or CSS colour string is not a conformant
 * colour value — carrying:
 *
 * - `colorSpace` (required). Figma variables are sRGB with 0-1 float channels,
 *   which is exactly the module's `srgb` space (§4.2.1), so no conversion
 *   happens on the way out and nothing is approximated.
 * - `components` (required). The three channels, in 0-1, in R/G/B order.
 * - `alpha` (optional). Written only when it isn't 1, since §4.1 says an
 *   omitted alpha "MUST be assumed to be 1 (fully opaque)" — so spelling it out
 *   adds noise to every opaque colour and says nothing.
 * - `hex` (optional). The fallback, which §4.1 requires to be "formatted in 6
 *   digit CSS hex color notation ... to avoid conflicts with the provided alpha
 *   value" — so it is built from the RGB channels only, with alpha forced to 1,
 *   and a translucent colour's hex deliberately describes its opaque form.
 *
 * Channels go through {@link cleanFloat32} for the same reason numeric values
 * do: Figma stores them as 32-bit floats and hands back the widened double, so
 * a channel a designer set to 0.2 arrives as 0.20000000298023224 and would be
 * written out that way verbatim.
 *
 * @param color - The Figma RGBA value, channels in 0-1
 * @returns The DTCG colour object
 */
export const toDtcgColorValue = ({ r, g, b, a = 1 }: RGBA): DtcgColorValue => {
  const alpha = cleanFloat32(a);
  return {
    colorSpace: "srgb",
    components: [cleanFloat32(r), cleanFloat32(g), cleanFloat32(b)],
    ...(alpha !== 1 ? { alpha } : {}),
    hex: rgbToCssColor({ r, g, b, a: 1 } as RGBA),
  };
};

/**
 * Reads a colour token's `$value` in either spelling: the DTCG object form
 * (every one of the fourteen colour spaces) or the CSS colour string this
 * plugin emitted before the object form existed, and which other tools and
 * hand-written token files still use.
 *
 * Throws when the value is neither, so the caller can skip that one value with
 * a warning instead of failing the whole import.
 *
 * @param raw - The raw `$value` read out of an imported file
 */
export const parseTokenColor = (raw: unknown): ParsedTokenColor => {
  if (isDtcgColorObject(raw)) {
    return parseDtcgColorValue(raw);
  }
  if (typeof raw === "object" && raw !== null) {
    throw new Error(
      `${JSON.stringify(raw)} is not a color: a DTCG color $value needs a "colorSpace" and a "components" array`
    );
  }
  return { rgba: cssColorToRgba(String(raw)), converted: false, gamutMapped: false, usedHexFallback: false };
};
