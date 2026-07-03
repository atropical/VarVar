import type { ExportFile } from "../types.d";

interface LegacyTokenFile {
  collection: string;
  mode: string;
  variables: Record<string, unknown>;
}

const PX_VALUE = /^(-?\d+(?:\.\d+)?)px$/;

function isTokenLeaf(node: unknown): node is Record<string, unknown> {
  return (
    typeof node === "object" &&
    node !== null &&
    "$type" in node &&
    "$value" in node
  );
}

/**
 * Rewrites a single DTCG token leaf (as produced by the current exporter) into the
 * flat pre-`12930fe` (v2.x) shape: raw `resolvedType` as `$type`, scopes as a sibling
 * `$scopes` key instead of `$extensions.figma.scopes`, and bare numeric `$value`s
 * (no `"px"` suffix). Relies on `$extensions.figma.resolvedType`, which the exporter
 * stores specifically so this conversion can be lossless.
 */
function toLegacyLeaf(node: Record<string, unknown>): Record<string, unknown> {
  const extensions = node.$extensions as { figma?: { scopes?: unknown; resolvedType?: unknown } } | undefined;
  const figma = extensions?.figma;

  let value = node.$value;
  if (typeof value === "string") {
    const match = PX_VALUE.exec(value);
    if (match) {
      value = parseFloat(match[1]);
    }
  }

  return {
    $type: figma?.resolvedType ?? node.$type,
    $scopes: figma?.scopes ?? [],
    $description: node.$description ?? "",
    $value: value,
  };
}

function toLegacyVariables(variables: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, node] of Object.entries(variables)) {
    if (isTokenLeaf(node)) {
      result[key] = toLegacyLeaf(node);
    } else if (typeof node === "object" && node !== null) {
      result[key] = toLegacyVariables(node as Record<string, unknown>);
    } else {
      result[key] = node;
    }
  }
  return result;
}

/**
 * Converts the current exporter's output files into the single flat file the plugin
 * produced before `12930fe` (v2.x): raw `$type`, sibling `$scopes`, no `px` units,
 * no `$extensions`, and no Enterprise extended-collection split (that concept didn't
 * exist in v2.x, so multi-file input is merged into one combined array).
 */
export function toLegacyJSON(files: ExportFile[]): ExportFile[] {
  const merged: LegacyTokenFile[] = [];

  for (const file of files) {
    const parsed: LegacyTokenFile[] = JSON.parse(file.content);
    for (const entry of parsed) {
      merged.push({
        collection: entry.collection,
        mode: entry.mode,
        variables: toLegacyVariables(entry.variables),
      });
    }
  }

  return [{ filename: "variables", content: JSON.stringify(merged, null, 2) }];
}
