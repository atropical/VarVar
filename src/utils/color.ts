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
