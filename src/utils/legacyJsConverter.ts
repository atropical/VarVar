/**
 * Converts the current exporter's JS output into the pre-`12930fe` (v2.x)
 * shape by stripping the `dtcgType` and `inherited` fields that were added to
 * each value object. Operates on the serialized source text (rather than
 * re-deriving from Figma) since `dtcgType`/`inherited` are always emitted as
 * the last property (or two) of a value object, so removing them along with
 * their preceding comma always yields a valid object literal.
 *
 * Enterprise extended-collection exports (which v2.x never had, and which
 * v2.x's own code would have silently dropped due to an unrelated bug fixed
 * in the same PR) are kept rather than reproduced with that data loss.
 */
export function toLegacyJS(js: string): string {
  return js
    .replace(/,(\r?\n\s*)dtcgType:\s*"[^"]*"/g, "")
    .replace(/,(\r?\n\s*)inherited:\s*(true|false)/g, "");
}
