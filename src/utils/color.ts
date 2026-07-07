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
