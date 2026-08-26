import { parseTokenColor, rgbToCssColor } from "./color";
import { colorConversionNote } from "./colorSpaces";
import { cleanFloat32 } from "./numberFormat";
import { DEFAULT_ROOT_FONT_SIZE, isFontRelativeUnit, normalizeRootFontSize, parseUnitValue } from "./units";
import { DTCG_FONT_WEIGHT_KEYWORDS } from "./scopeToDTCG";
import { CODE_SYNTAX_PLATFORMS, normalizeCodeSyntax } from "./variableUtils";
import type { CodeSyntaxMap } from "./variableUtils";
import { ImportMode } from "../types.d";
import type { ImportSummary, ImportDiff, ImportDiffVariable, ImportDiffCodeSyntax } from "../types.d";

const validTypes = new Set(["COLOR", "FLOAT", "BOOLEAN", "STRING"]);

/**
 * Fallback mapping from DTCG `$type` names to Figma's raw resolved types, used
 * when a leaf has neither `$extensions.figma.resolvedType` (current shape)
 * nor a raw `$type` (legacy shape) to read the resolved type from directly —
 * i.e. a plain DTCG token file that was never a VarVar export.
 *
 * A `$type` alone doesn't always pin down one Figma type: `fontWeight` is
 * spec-conformant with either a number or one of the predefined keyword
 * strings. The entry here is only the type such a token gets when its value
 * says nothing (an alias reference), and {@link dtcgFallbackType} decides from
 * the actual value everywhere else.
 */
const DTCG_TYPE_TO_RESOLVED_TYPE: Record<string, VariableResolvedDataType> = {
  color: "COLOR",
  dimension: "FLOAT",
  number: "FLOAT",
  fontWeight: "FLOAT",
  boolean: "BOOLEAN",
  string: "STRING",
  fontFamily: "STRING",
};

interface ImportFileEntry {
  collection: string;
  mode: string;
  variables: Record<string, unknown>;
}

interface ImportRecord {
  collectionName: string;
  modeName: string;
  pathParts: string[];
  resolvedType: VariableResolvedDataType;
  scopes: VariableScope[];
  description: string;
  codeSyntax: CodeSyntaxMap | undefined;
  rawValue: unknown;
  /**
   * True when this mode's value couldn't decide the variable's type — a
   * `fontWeight` alias reference, which carries no value of its own. Such a
   * record adopts whatever type the variable's other modes settle on.
   */
  typeDeferred: boolean;
}

function isTokenLeaf(node: unknown): node is Record<string, unknown> {
  return (
    typeof node === "object" &&
    node !== null &&
    "$type" in node &&
    "$value" in node
  );
}

/**
 * The Figma resolved type a plain DTCG leaf should become, derived from its
 * `$type` *and* its actual value.
 *
 * `$type` alone is not enough for `fontWeight`: the spec conforms a number in
 * [1, 1000] and, equally, one of the predefined keyword strings (`"bold"`,
 * `"semi-bold"`, …). A number becomes a FLOAT variable holding that number and
 * a keyword becomes a STRING variable holding that keyword verbatim — the value
 * is never rewritten into the other shape, since translating `"bold"` into 700
 * would silently make the document say something the file doesn't.
 *
 * A non-keyword string under `$type: fontWeight` isn't conformant, but it is
 * still a string: it is kept exactly as written in a STRING variable, and the
 * caller is handed a note to warn with.
 *
 * @param rawType - The leaf's `$type`
 * @param rawValue - The leaf's `$value`, which may decide the type
 * @returns The resolved type (undefined when the `$type` is unsupported),
 *   whether the value was too uninformative to decide (see
 *   {@link ImportRecord.typeDeferred}), and an optional warning note.
 */
function dtcgFallbackType(rawType: string, rawValue: unknown): {
  resolvedType: VariableResolvedDataType | undefined;
  typeDeferred: boolean;
  note?: string;
} {
  const tabled = DTCG_TYPE_TO_RESOLVED_TYPE[rawType];

  if (rawType === "fontFamily" && Array.isArray(rawValue)) {
    // DTCG allows a font stack (`["Inter", "sans-serif"]`). Figma has no array
    // variable, so the joined string is the closest thing there is — but it is
    // a rewrite of the value, so it gets said out loud.
    return {
      resolvedType: "STRING",
      typeDeferred: false,
      note: `value ${JSON.stringify(rawValue)} is a DTCG font stack; Figma has no list-valued variable, so it was imported as the string "${String(rawValue)}".`,
    };
  }

  if (rawType !== "fontWeight") {
    return { resolvedType: tabled, typeDeferred: false };
  }

  if (typeof rawValue === "number") {
    return { resolvedType: "FLOAT", typeDeferred: false };
  }
  if (typeof rawValue === "string") {
    if (isAliasValue(rawValue) || rawValue === "_unlinked") {
      // A reference has no value of its own; the other modes decide.
      return { resolvedType: tabled, typeDeferred: true };
    }
    if (DTCG_FONT_WEIGHT_KEYWORDS.has(rawValue)) {
      return { resolvedType: "STRING", typeDeferred: false };
    }
    return {
      resolvedType: "STRING",
      typeDeferred: false,
      note: `value "${rawValue}" is not one of the DTCG predefined fontWeight keywords — it was imported verbatim as a string variable.`,
    };
  }
  return { resolvedType: tabled, typeDeferred: false };
}

/**
 * Reads a token leaf produced by the current (v3.x, `$extensions.figma`) or
 * legacy (v2.x, sibling `$scopes`, raw `$type`) exporter shape, falling back
 * to mapping a plain DTCG `$type` (e.g. hand-authored token files) when
 * neither is present. Returns `undefined` `resolvedType` if the type can't be
 * resolved at all.
 */
function normalizeLeaf(node: Record<string, unknown>): {
  resolvedType: VariableResolvedDataType | undefined;
  scopes: VariableScope[];
  description: string;
  codeSyntax: CodeSyntaxMap | undefined;
  rawValue: unknown;
  typeDeferred: boolean;
  note?: string;
} {
  const extensions = node.$extensions as { figma?: { scopes?: VariableScope[]; resolvedType?: VariableResolvedDataType; codeSyntax?: CodeSyntaxMap } } | undefined;
  const figma = extensions?.figma;

  const rawType = node.$type as string | undefined;
  const declaredType = figma?.resolvedType
    ?? (rawType && validTypes.has(rawType) ? (rawType as VariableResolvedDataType) : undefined);
  // A file that states the Figma type outright is taken at its word; only a
  // plain DTCG `$type` has to be read together with its value.
  const fallback = declaredType === undefined && rawType !== undefined
    ? dtcgFallbackType(rawType, node.$value)
    : undefined;
  const resolvedType = declaredType ?? fallback?.resolvedType;

  const scopes = figma?.scopes ?? (node.$scopes as VariableScope[] | undefined) ?? [];
  const description = (node.$description as string) ?? "";
  // Absent in legacy (v2.x) and plain DTCG files, so it stays optional
  // throughout — a file that says nothing about code syntax never touches it.
  const codeSyntax = normalizeCodeSyntax(figma?.codeSyntax);

  return {
    resolvedType,
    scopes,
    description,
    codeSyntax,
    rawValue: node.$value,
    typeDeferred: fallback?.typeDeferred ?? false,
    note: fallback?.note,
  };
}

function walkVariables(
  variables: Record<string, unknown>,
  collectionName: string,
  modeName: string,
  pathParts: string[],
  records: ImportRecord[],
  warnings: string[],
  unitsSeen: Set<string>
): void {
  for (const [key, node] of Object.entries(variables)) {
    if (isTokenLeaf(node)) {
      const { resolvedType, scopes, description, codeSyntax, rawValue, typeDeferred, note } = normalizeLeaf(node);
      const path = [...pathParts, key].join("/");
      if (!resolvedType || !validTypes.has(resolvedType)) {
        warnings.push(`Skipped "${path}" in "${collectionName}" (${modeName}): unrecognized or unsupported $type "${String(node.$type)}".`);
        continue;
      }
      // Note every unit the file carries — in either spelling, the "16px"
      // string or the DTCG `{ value, unit }` object — so the UI can ask for a
      // root font size when (and only when) a font-relative one is present.
      if (resolvedType === "FLOAT") {
        const withUnit = parseUnitValue(rawValue);
        if (withUnit) unitsSeen.add(withUnit.unit);
      }
      if (note) {
        warnings.push(`"${path}" in "${collectionName}" (${modeName}): ${note}`);
      }
      records.push({
        collectionName,
        modeName,
        pathParts: [...pathParts, key],
        resolvedType,
        scopes,
        description,
        codeSyntax,
        rawValue,
        typeDeferred,
      });
    } else if (typeof node === "object" && node !== null) {
      walkVariables(node as Record<string, unknown>, collectionName, modeName, [...pathParts, key], records, warnings, unitsSeen);
    }
  }
}

/**
 * Forces every mode of one variable onto a single Figma resolved type.
 *
 * A Figma variable has one resolved type across all its modes, but a file can
 * disagree with itself — most plausibly a `fontWeight` token written as the
 * number 700 in one mode and the keyword `"bold"` in another, each perfectly
 * conformant on its own. Left alone, the type of whichever mode happened to be
 * read first would decide the variable and the other modes' values would fail
 * to be written.
 *
 * The rule: a FLOAT/STRING disagreement resolves to STRING, because a STRING
 * variable can hold every mode's value exactly as the file spells it (`700`
 * becomes `"700"`, `"bold"` stays `"bold"`), whereas FLOAT would require
 * translating keywords into numbers the file never said. Any other
 * disagreement (a genuinely incoherent file — COLOR against BOOLEAN, say) keeps
 * the first mode's type, which is what earlier versions did. Either way the
 * variable is named in a warning.
 *
 * Modes whose value couldn't decide a type (`typeDeferred` — an alias
 * reference) don't get a vote, but do adopt the outcome.
 */
function reconcileRecordTypes(records: ImportRecord[], warnings: string[]): void {
  const groups = new Map<string, ImportRecord[]>();
  for (const record of records) {
    const key = `${record.collectionName}\u0000${record.pathParts.join("/")}`;
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  for (const group of groups.values()) {
    const decisive = group.filter((record) => !record.typeDeferred);
    const types = [...new Set(decisive.map((record) => record.resolvedType))];

    if (types.length === 0) continue;

    if (types.length > 1) {
      const isFloatStringMix = types.every((type) => type === "FLOAT" || type === "STRING");
      const chosen = isFloatStringMix ? "STRING" : decisive[0].resolvedType;
      const perMode = decisive.map((record) => `${record.modeName}: ${record.resolvedType}`).join(", ");
      warnings.push(
        `Variable "${group[0].pathParts.join("/")}" in "${group[0].collectionName}" has values of different types across modes (${perMode}). `
        + `A Figma variable has one type for all modes, so it was imported as ${chosen}`
        + (isFloatStringMix ? ", which keeps every mode's value exactly as the file spells it." : ", the type of its first mode.")
      );
      for (const record of group) record.resolvedType = chosen;
      continue;
    }

    // Single agreed type — hand it to the modes that had no value to decide with.
    for (const record of group) record.resolvedType = types[0];
  }
}

/**
 * Parses and merges every raw JSON file's `{collection, mode, variables}[]`
 * array into a flat list of per-variable-per-mode records, alongside every
 * CSS unit suffix those records' numeric values carry.
 */
function collectRecords(rawFiles: string[]): { records: ImportRecord[]; warnings: string[]; unitsSeen: string[] } {
  const records: ImportRecord[] = [];
  const warnings: string[] = [];
  const unitsSeen = new Set<string>();

  for (const raw of rawFiles) {
    const entries: ImportFileEntry[] = JSON.parse(raw);
    for (const entry of entries) {
      walkVariables(entry.variables, entry.collection, entry.mode, [], records, warnings, unitsSeen);
    }
  }

  reconcileRecordTypes(records, warnings);

  return { records, warnings, unitsSeen: [...unitsSeen].sort() };
}

/**
 * True if this value *could* be the plugin's `$.Collection.Mode.path`
 * alias-reference convention (as opposed to a literal value or `"_unlinked"`).
 *
 * For COLOR/FLOAT/BOOLEAN tokens the `"$."` prefix can only ever be a
 * reference. For a STRING token it's genuinely ambiguous: a string variable's
 * real value can legitimately start with `"$."`. Such a value is therefore
 * treated only as a *candidate* alias — the phase-3 loop writes it back as a
 * plain string literal (using the token's declared resolved type) when it
 * doesn't resolve against any known collection/mode/variable, instead of
 * dropping it with a warning.
 */
function isAliasValue(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("$.") && value !== "_unlinked";
}

interface AliasTarget {
  collectionName: string;
  modeName: string;
  path: string;
}

/**
 * Every way `body` can be read as `"<name>.<rest>"` for some name in `names`,
 * longest name first. Matching against known names (rather than blindly
 * splitting on every ".") is what lets collection and mode names that
 * themselves contain literal dots round-trip correctly.
 *
 * All matches are returned, not just the longest, because a mode name can
 * collide with the leading group segment of a variable path: a collection with
 * modes `A` and `A.B` holding a variable `B/x` in mode `A` exports as
 * `$.C.A.B.x`, which reads equally well as mode `A.B` + path `x`. The caller
 * validates each reading in turn against real variables.
 */
function splitsOnKnownNames(body: string, names: string[]): { name: string; rest: string }[] {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const splits: { name: string; rest: string }[] = [];
  for (const name of sorted) {
    if (body.startsWith(`${name}.`)) {
      splits.push({ name, rest: body.slice(name.length + 1) });
    }
  }
  return splits;
}

/**
 * Caps on how many readings of a single alias reference are enumerated. The
 * number of ways to unflatten a path is exponential in its dot count
 * (2^dots), so a deeply nested path would otherwise explode. Both limits are
 * generous relative to real token paths — a 6-level path is fully covered —
 * and truncation only ever drops the *least* specific readings, since
 * candidates are generated most-specific first.
 */
const MAX_PATH_VARIANTS_PER_MODE = 64;
const MAX_ALIAS_CANDIDATES = 512;

/**
 * Every way the flattened tail of an alias reference can be read back as a
 * variable path, most-specific first.
 *
 * Export flattens a variable's "/" separators to "." (`resolveAliasValue` in
 * collectionToJSON.ts), which is lossy: a variable actually named
 * `color.primary/base` and one named `color/primary/base` both export as
 * `color.primary.base`. Each "." in the tail is therefore either a group
 * separator or a literal dot in a name, so every combination is a plausible
 * reading. They're yielded in order of decreasing separator count, which puts
 * the historic "every dot is a separator" interpretation first — so any
 * reference that resolves today still resolves to exactly the same variable.
 */
function pathVariants(rest: string, limit: number): string[] {
  const dotIndices: number[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === ".") dotIndices.push(i);
  }
  if (dotIndices.length === 0) return [rest];

  const build = (literalDots: number[]): string => {
    const literal = new Set(literalDots);
    let out = "";
    let cursor = 0;
    for (let i = 0; i < dotIndices.length; i += 1) {
      out += rest.slice(cursor, dotIndices[i]);
      out += literal.has(i) ? "." : "/";
      cursor = dotIndices[i] + 1;
    }
    return out + rest.slice(cursor);
  };

  const variants: string[] = [];
  // `keptLiteral` ascending == separator count descending == most specific first.
  for (let keptLiteral = 0; keptLiteral <= dotIndices.length && variants.length < limit; keptLiteral += 1) {
    const combo: number[] = [];
    // Returns false once the limit is hit, unwinding the recursion.
    const emit = (start: number): boolean => {
      if (combo.length === keptLiteral) {
        variants.push(build(combo));
        return variants.length < limit;
      }
      for (let i = start; i < dotIndices.length; i += 1) {
        combo.push(i);
        const more = emit(i + 1);
        combo.pop();
        if (!more) return false;
      }
      return true;
    };
    emit(0);
  }
  return variants;
}

/**
 * Resolves a `$.Collection.Mode.path` (or same-collection `$..Mode.path`)
 * alias-reference string into every plausible `{collection, mode, path}`
 * interpretation, most-specific first. The convention's own "." separator is
 * ambiguous with a literal "." inside a collection, mode or variable name
 * (e.g. a collection named ".Brand", or a variable named `color.primary`), so
 * this can't be resolved by string-splitting alone — instead the collection
 * and mode segments are matched against the actual known names, the variable
 * tail is expanded into every possible group/name split, and the caller
 * validates each candidate against real variables until one resolves.
 *
 * Candidate order is stable and starts with exactly what earlier versions
 * produced (longest collection name, longest mode name, every dot in the tail
 * read as a group separator), so files exported by older versions import
 * identically.
 */
function resolveAliasCandidates(
  value: string,
  currentCollectionName: string,
  collectionRefsByName: Map<string, CollectionRef>
): AliasTarget[] {
  const remainder = value.slice(2);
  const candidates: AliasTarget[] = [];

  const pushSplits = (collectionName: string, body: string, modeNames: string[]): void => {
    for (const split of splitsOnKnownNames(body, modeNames)) {
      if (candidates.length >= MAX_ALIAS_CANDIDATES) return;
      const budget = Math.min(MAX_PATH_VARIANTS_PER_MODE, MAX_ALIAS_CANDIDATES - candidates.length);
      for (const path of pathVariants(split.rest, budget)) {
        candidates.push({ collectionName, modeName: split.name, path });
      }
    }
  };

  // Explicit "$.Collection.Mode.path" form — tried first since matching an
  // actual known collection name is stronger evidence than the generic
  // same-collection fallback below.
  const collectionNames = [...collectionRefsByName.keys()].sort((a, b) => b.length - a.length);
  for (const collectionName of collectionNames) {
    if (!remainder.startsWith(`${collectionName}.`)) continue;
    const rest = remainder.slice(collectionName.length + 1);
    pushSplits(collectionName, rest, collectionRefsByName.get(collectionName)!.modes.map((m) => m.name));
  }

  // Same-collection "$..Mode.path" form (empty collection segment).
  if (remainder.startsWith(".")) {
    const currentCollection = collectionRefsByName.get(currentCollectionName);
    if (currentCollection) {
      pushSplits(currentCollectionName, remainder.slice(1), currentCollection.modes.map((m) => m.name));
    }
  }

  return candidates;
}

/**
 * Figma treats a `.` or `_`-prefixed name segment as "private" — hidden from
 * publishing when the file is shared as a library — for collections,
 * variables, components, and styles alike. A collection or variable whose
 * name (or any group segment of it) starts with either prefix is recreated
 * on import with `hiddenFromPublishing` set, so that intent survives the
 * round-trip rather than just looking private without actually being so.
 */
function hasPrivateNamingConvention(name: string): boolean {
  return name.split("/").some((segment) => segment.startsWith(".") || segment.startsWith("_"));
}

async function findVariableByName(collection: VariableCollection, name: string): Promise<Variable | undefined> {
  const variables = await Promise.all(
    collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id))
  );
  return variables.find((v): v is Variable => v !== null && v.name === name);
}

/**
 * Turns an imported numeric value back into the plain number Figma stores,
 * honouring the unit when the value carries one.
 *
 * A numeric value can carry its unit in either of two spellings, and both are
 * accepted (including mixed within one file):
 *
 * - the DTCG object form the exporter now emits, `{ "value": 16, "unit": "px" }`;
 * - the `"16px"` string earlier versions emitted, which the exporter still
 *   offers as an escape hatch.
 *
 * From there:
 *
 * - `rem`/`em` are font-relative, so the number is multiplied by the root font
 *   size the user gave: `"2rem"` with a root of 16 becomes 32. The product goes
 *   through {@link cleanFloat32} so the multiplication can't reintroduce the
 *   float noise that function exists to strip.
 * - `px` maps 1:1 onto a Figma number, so the unit is simply dropped.
 * - Any other unit (`pt`, `vh`, `%`, …) has no Figma equivalent. The unit is
 *   dropped and the number kept as-is — exactly what every earlier version did
 *   — but the caller is told so it can warn, since that really is lossy.
 * - Anything carrying no unit at all (a bare number, or junk) falls through to
 *   plain `parseFloat`, which is what this function used to be.
 *
 * @param raw - The raw `$value`, in whichever shape the file spells it
 * @param rootFontSize - Already-normalized root font size to multiply `rem`/`em` by
 * @param onLossyUnit - Called with the unit name when a unit is dropped lossily
 */
function parseImportedNumber(
  raw: unknown,
  rootFontSize: number,
  onLossyUnit: (unit: string) => void
): number {
  const withUnit = parseUnitValue(raw);
  if (!withUnit) return parseFloat(String(raw));

  if (isFontRelativeUnit(withUnit.unit)) {
    return cleanFloat32(withUnit.number * rootFontSize);
  }
  if (withUnit.unit !== "px") onLossyUnit(withUnit.unit);
  return withUnit.number;
}

/**
 * Renders a raw `$value` for a warning message. Objects (the DTCG
 * `{ value, unit }` dimension and `{ colorSpace, components }` colour shapes)
 * go through JSON.stringify so the message says what was actually in the file
 * rather than "[object Object]".
 */
function describeRawValue(raw: unknown): string {
  return typeof raw === "object" && raw !== null ? JSON.stringify(raw) : String(raw);
}

/**
 * Turns one token file's `$value` into the value Figma stores for it.
 *
 * @param rawValue - The raw `$value`, in whichever shape the file spells it
 * @param resolvedType - The Figma type the variable is being imported as
 * @param rootFontSize - Already-normalized root font size for `rem`/`em`
 * @param onLossyUnit - Called with the unit name when a unit is dropped lossily
 * @param onColorNote - Called when a colour had to be converted out of a colour
 *   space Figma variables cannot store (see {@link colorConversionNote})
 */
function parseLiteralValue(
  rawValue: unknown,
  resolvedType: VariableResolvedDataType,
  rootFontSize: number,
  onLossyUnit: (unit: string) => void,
  onColorNote: (note: string) => void
): VariableValue {
  switch (resolvedType) {
    case "COLOR": {
      const parsed = parseTokenColor(rawValue);
      const note = colorConversionNote(parsed);
      if (note) onColorNote(note);
      return parsed.rgba;
    }
    case "FLOAT":
      return parseImportedNumber(rawValue, rootFontSize, onLossyUnit);
    case "BOOLEAN":
      return Boolean(rawValue);
    default:
      return String(rawValue);
  }
}

function isAliasStoredValue(value: VariableValue | undefined): value is VariableAlias {
  return typeof value === "object" && value !== null && (value as VariableAlias).type === "VARIABLE_ALIAS";
}

function formatLiteral(value: VariableValue, type: VariableResolvedDataType): string {
  if (type === "COLOR") return rgbToCssColor(value as RGBA);
  return String(value);
}

/** Renders a stored (pre-existing) variable value for diff display, resolving alias targets by name. */
async function formatStoredValue(value: VariableValue | undefined, type: VariableResolvedDataType): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (isAliasStoredValue(value)) {
    const target = await figma.variables.getVariableByIdAsync(value.id);
    return target ? `→ ${target.name}` : "→ (broken alias)";
  }
  return formatLiteral(value, type);
}

/**
 * Whether an existing stored value already equals the literal value about to
 * be imported.
 *
 * COLOR needs a tolerance, and which tolerance depends on how the file spelled
 * the colour:
 *
 * - A CSS colour string carries the export format's own quantization
 *   (`rgbToCssColor`: 8-bit per RGB channel, 2 decimal places for alpha), so an
 *   imported value can never be more precise than that. Comparing at full float
 *   precision against a native Figma colour (which isn't on that grid) would
 *   report a "change" on every re-import of a file this plugin wrote, so both
 *   sides are rounded to the 8-bit grid first.
 * - The DTCG object form carries the full channel values, so it is compared on
 *   the float32 grid Figma actually stores colours on instead — precise enough
 *   that a real sub-1/255 change is seen, and still stable across re-imports
 *   (the exported decimal and the stored channel are the same float32 even when
 *   they are different doubles, which is the whole point of `cleanFloat32`).
 *
 * @param before - The variable's current value for this mode
 * @param after - The value parsed out of the file
 * @param type - The variable's resolved type
 * @param quantized - True when the file spelled this value in a form that has
 *   already lost precision — i.e. a CSS colour string
 */
function literalValueEquals(
  before: VariableValue | undefined,
  after: VariableValue,
  type: VariableResolvedDataType,
  quantized: boolean
): boolean {
  if (before === undefined || isAliasStoredValue(before)) return false;
  if (type === "COLOR") {
    const a = before as RGBA;
    const b = after as RGBA;
    const ch = quantized ? (n: number) => Math.round(n * 255) : Math.fround;
    const alpha = quantized ? (n: number) => Math.round(n * 100) : Math.fround;
    return ch(a.r) === ch(b.r) && ch(a.g) === ch(b.g) && ch(a.b) === ch(b.b) && alpha(a.a) === alpha(b.a);
  }
  return before === after;
}

/** Whether an existing stored value is already an alias pointing at `targetId`. */
function aliasValueEquals(before: VariableValue | undefined, targetId: string | undefined): boolean {
  if (!targetId || !isAliasStoredValue(before)) return false;
  return before.id === targetId;
}

/**
 * Itemizes what the file's code syntax would change on a variable, one entry
 * per platform the file actually carries. Platforms the file says nothing
 * about are left alone — same as scopes, an import only ever adds or updates
 * what it was given, it never clears an override the document already has.
 * @param existing - The variable's current `codeSyntax` (absent for a create)
 * @param incoming - The normalized `$extensions.figma.codeSyntax` from the file
 */
function buildCodeSyntaxDiff(
  existing: CodeSyntaxMap | undefined,
  incoming: CodeSyntaxMap | undefined
): ImportDiffCodeSyntax[] {
  if (!incoming) return [];

  const entries: ImportDiffCodeSyntax[] = [];
  for (const platform of CODE_SYNTAX_PLATFORMS) {
    const after = incoming[platform];
    if (typeof after !== "string" || after === "") continue;
    const before = existing ? existing[platform] : undefined;
    entries.push({ platform, before, after, changed: before !== after });
  }
  return entries;
}

/**
 * Writes the changed code-syntax entries onto a variable. A platform Figma
 * refuses is collected as a warning rather than aborting the import, like
 * every other per-variable write here.
 * @param variable - The variable to write to
 * @param entries - The diff produced by {@link buildCodeSyntaxDiff}
 * @param summary - Run summary, for the counter and any warnings
 * @param collectionName - Collection name, for warning text
 * @param path - Variable path, for warning text
 */
function applyCodeSyntax(
  variable: Variable,
  entries: ImportDiffCodeSyntax[],
  summary: ImportSummary,
  collectionName: string,
  path: string
): void {
  for (const entry of entries) {
    if (!entry.changed) continue;
    try {
      variable.setVariableCodeSyntax(entry.platform, entry.after);
      summary.codeSyntaxSet += 1;
    } catch (err) {
      summary.warnings.push(
        `Failed to set ${entry.platform} code syntax for "${path}" in "${collectionName}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

/**
 * Writes scopes onto a variable, tolerating a scope Figma refuses for that
 * variable's type.
 *
 * Scopes and types aren't fully orthogonal in Figma, and the import can now
 * legitimately create a STRING variable from a FONT_WEIGHT-scoped token (a
 * `fontWeight` keyword). If Figma won't take the scope, the value is still
 * worth importing — the scope is dropped with a warning rather than aborting.
 * @param variable - The variable to write to
 * @param scopes - The scopes the file carries
 * @param summary - Run summary, for any warning
 * @param collectionName - Collection name, for warning text
 * @param path - Variable path, for warning text
 */
function applyScopes(
  variable: Variable,
  scopes: VariableScope[],
  summary: ImportSummary,
  collectionName: string,
  path: string
): void {
  try {
    variable.scopes = scopes;
  } catch (err) {
    summary.warnings.push(
      `Could not apply scopes [${scopes.join(", ")}] to "${path}" in "${collectionName}" (${variable.resolvedType}): ${err instanceof Error ? err.message : String(err)} — the variable was imported without them.`
    );
  }
}

function scopesEqual(a: VariableScope[], b: VariableScope[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((s) => setB.has(s));
}

interface ModeRef {
  modeId: string;
  name: string;
  isNew: boolean;
}

interface CollectionRef {
  name: string;
  real?: VariableCollection;
  isNew: boolean;
  modes: ModeRef[];
}

interface VariableRef {
  path: string;
  collectionName: string;
  real?: Variable;
  isNew: boolean;
  resolvedType: VariableResolvedDataType;
}

function syntheticModeId(collectionName: string, modeName: string): string {
  return `new:${collectionName}:${modeName}`;
}

/**
 * Core import walk shared by dry-run preview and real execution. When
 * `dryRun` is true, every `figma.variables.*` mutation call is skipped —
 * only read APIs run — while the exact same decisions (what would be
 * created/updated/deleted) are still recorded into `diff` and `summary`.
 * This guarantees the preview a user sees and the run they confirm can
 * never drift apart, since it's the same code path either way.
 *
 * `rootFontSize` is what any `rem`/`em` value in the file is multiplied by to
 * get back to the number Figma stores; it is normalized here so an empty, zero
 * or non-numeric entry can only ever fall back to 16.
 */
async function runImport(rawFiles: string[], importMode: ImportMode, dryRun: boolean, rootFontSize: number): Promise<{ summary: ImportSummary; diff: ImportDiff }> {
  const rootSize = normalizeRootFontSize(rootFontSize);
  const summary: ImportSummary = {
    collectionsCreated: 0,
    collectionsReused: 0,
    collectionsDeleted: 0,
    modesCreated: 0,
    modesDeleted: 0,
    variablesCreated: 0,
    variablesUpdated: 0,
    variablesDeleted: 0,
    valuesSet: 0,
    aliasesResolved: 0,
    codeSyntaxSet: 0,
    warnings: [],
    unitsSeen: [],
    hasFontRelativeUnits: false,
  };

  const diff: ImportDiff = { collections: [], modes: [], variables: [] };

  const { records, warnings: parseWarnings, unitsSeen } = collectRecords(rawFiles);
  summary.warnings.push(...parseWarnings);
  summary.unitsSeen = unitsSeen;
  summary.hasFontRelativeUnits = unitsSeen.some(isFontRelativeUnit);

  if (records.length === 0) {
    summary.warnings.push("No importable variables were found in the selected file(s) — nothing was changed.");
    return { summary, diff };
  }

  const collectionRefsByName = new Map<string, CollectionRef>();

  if (importMode === ImportMode.CLEAN) {
    const toDelete = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of toDelete) {
      diff.collections.push({ name: collection.name, action: "delete" });
      summary.collectionsDeleted += 1;
      if (!dryRun) collection.remove();
    }
    // Everything downstream treats the document as if it had no existing
    // collections at all — matches the real post-deletion state in apply
    // mode, and simulates it in dry-run mode.
  } else {
    const existing = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of existing) {
      collectionRefsByName.set(collection.name, {
        name: collection.name,
        real: collection,
        isNew: false,
        modes: collection.modes.map((m) => ({ modeId: m.modeId, name: m.name, isNew: false })),
      });
    }
  }

  // --- Phase 1: collections & modes ---
  const modeNamesByCollection = new Map<string, string[]>();
  for (const record of records) {
    const modeNames = modeNamesByCollection.get(record.collectionName) ?? [];
    if (!modeNames.includes(record.modeName)) modeNames.push(record.modeName);
    modeNamesByCollection.set(record.collectionName, modeNames);
  }

  for (const [collectionName, modeNames] of modeNamesByCollection) {
    let collRef = collectionRefsByName.get(collectionName);
    let isNewCollection = false;

    if (!collRef) {
      // Update-only never creates: a collection missing locally means every
      // record under it is skipped entirely (handled by the `!collRef`
      // guards in phases 2/3 below).
      if (importMode === ImportMode.UPDATE_ONLY) continue;

      isNewCollection = true;
      const hidden = hasPrivateNamingConvention(collectionName);
      let real: VariableCollection | undefined;
      if (!dryRun) {
        real = figma.variables.createVariableCollection(collectionName);
        if (hidden) real.hiddenFromPublishing = true;
      }
      collRef = {
        name: collectionName,
        real,
        isNew: true,
        modes: [{ modeId: real ? real.modes[0].modeId : syntheticModeId(collectionName, "__default__"), name: real ? real.modes[0].name : "__default__", isNew: true }],
      };
      collectionRefsByName.set(collectionName, collRef);
      summary.collectionsCreated += 1;
      diff.collections.push({ name: collectionName, action: "create" });
    } else {
      summary.collectionsReused += 1;
      diff.collections.push({ name: collectionName, action: "reuse" });
    }

    const ref = collRef;
    modeNames.forEach((modeName, index) => {
      const existingMode = ref.modes.find((m) => m.name === modeName);
      if (existingMode) return;
      if (importMode === ImportMode.UPDATE_ONLY) return;

      if (isNewCollection && index === 0) {
        // Rename the collection's auto-created default mode instead of adding a new one.
        if (!dryRun && ref.real) {
          ref.real.renameMode(ref.modes[0].modeId, modeName);
        }
        ref.modes[0] = { modeId: ref.modes[0].modeId, name: modeName, isNew: true };
        summary.modesCreated += 1;
        diff.modes.push({ collectionName, name: modeName, action: "create" });
        return;
      }

      let modeId = syntheticModeId(collectionName, modeName);
      if (!dryRun && ref.real) {
        try {
          ref.real.addMode(modeName);
          modeId = ref.real.modes.find((m) => m.name === modeName)!.modeId;
        } catch (err) {
          summary.warnings.push(
            `Could not add mode "${modeName}" to collection "${collectionName}": ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
      }
      ref.modes.push({ modeId, name: modeName, isNew: true });
      summary.modesCreated += 1;
      diff.modes.push({ collectionName, name: modeName, action: "create" });
    });
  }

  // --- Phase 2: variables ---
  const variableRefsByPath = new Map<string, VariableRef>();
  const variableDiffByPath = new Map<string, ImportDiffVariable>();
  // Whether a *matched* (not newly-created) variable's own metadata
  // (description/scopes) actually differs from the file — combined with the
  // per-mode value diffs at the end to decide whether it was a true no-op.
  const metadataChangedByPath = new Map<string, boolean>();
  const seenPaths = new Set<string>();

  for (const record of records) {
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);

    const collRef = collectionRefsByName.get(record.collectionName);
    if (!collRef) continue;

    const varName = record.pathParts.join("/");
    let existingVariable: Variable | undefined;
    if (collRef.real) {
      existingVariable = await findVariableByName(collRef.real, varName);
    }

    let varRef: VariableRef;
    let diffEntry: ImportDiffVariable;

    if (existingVariable) {
      if (existingVariable.resolvedType !== record.resolvedType) {
        summary.warnings.push(
          `Skipped variable "${varName}" in "${record.collectionName}": existing type ${existingVariable.resolvedType} does not match imported type ${record.resolvedType}.`
        );
        continue;
      }
      varRef = { path: varName, collectionName: record.collectionName, real: existingVariable, isNew: false, resolvedType: existingVariable.resolvedType };
      diffEntry = { collectionName: record.collectionName, path: varName, action: "update", resolvedType: record.resolvedType, values: [] };

      // Only touch description/scopes/code syntax — and only count this as a
      // real update — when they actually differ, so an unchanged re-import of
      // an identical file is a true no-op rather than a no-op-with-a-write.
      const willWriteScopes = record.scopes.length > 0 && !record.scopes.includes("ALL_SCOPES");
      const descriptionChanged = existingVariable.description !== record.description;
      const scopesChanged = willWriteScopes && !scopesEqual(existingVariable.scopes, record.scopes);
      const codeSyntaxDiff = buildCodeSyntaxDiff(existingVariable.codeSyntax, record.codeSyntax);
      const codeSyntaxChanged = codeSyntaxDiff.some((entry) => entry.changed);
      if (codeSyntaxDiff.length > 0) diffEntry.codeSyntax = codeSyntaxDiff;
      metadataChangedByPath.set(pathKey, descriptionChanged || scopesChanged || codeSyntaxChanged);

      if (dryRun) {
        summary.codeSyntaxSet += codeSyntaxDiff.filter((entry) => entry.changed).length;
      } else if (varRef.real) {
        if (descriptionChanged) varRef.real.description = record.description;
        if (scopesChanged) applyScopes(varRef.real, record.scopes, summary, record.collectionName, varName);
        applyCodeSyntax(varRef.real, codeSyntaxDiff, summary, record.collectionName, varName);
      }
    } else {
      // Update-only never creates a variable that doesn't already exist.
      if (importMode === ImportMode.UPDATE_ONLY) continue;

      const hidden = hasPrivateNamingConvention(varName);
      let real: Variable | undefined;
      if (!dryRun && collRef.real) {
        real = figma.variables.createVariable(varName, collRef.real, record.resolvedType);
        if (hidden) real.hiddenFromPublishing = true;
      }
      varRef = { path: varName, collectionName: record.collectionName, real, isNew: true, resolvedType: record.resolvedType };
      diffEntry = { collectionName: record.collectionName, path: varName, action: "create", resolvedType: record.resolvedType, values: [] };
      summary.variablesCreated += 1;

      // A brand-new variable has no code syntax of its own yet, so everything
      // the file carries is a change.
      const codeSyntaxDiff = buildCodeSyntaxDiff(undefined, record.codeSyntax);
      if (codeSyntaxDiff.length > 0) diffEntry.codeSyntax = codeSyntaxDiff;

      if (dryRun) {
        summary.codeSyntaxSet += codeSyntaxDiff.length;
      } else if (varRef.real) {
        varRef.real.description = record.description;
        if (record.scopes.length > 0 && !record.scopes.includes("ALL_SCOPES")) {
          applyScopes(varRef.real, record.scopes, summary, record.collectionName, varName);
        }
        applyCodeSyntax(varRef.real, codeSyntaxDiff, summary, record.collectionName, varName);
      }
    }

    variableRefsByPath.set(pathKey, varRef);
    variableDiffByPath.set(pathKey, diffEntry);
    diff.variables.push(diffEntry);
  }

  // --- Phase 3: values (literals first, then aliases so every variable already exists) ---

  /**
   * Records and (outside dry-run) writes one literal value for one mode.
   * Shared by the literal pass and by the alias pass's fallback for a STRING
   * token whose value merely *looks* like an alias reference.
   */
  const applyLiteralValue = async (
    record: ImportRecord,
    varRef: VariableRef,
    modeRef: ModeRef,
    diffEntry: ImportDiffVariable | undefined
  ): Promise<void> => {
    let newValue: VariableValue;
    try {
      newValue = parseLiteralValue(
        record.rawValue,
        record.resolvedType,
        rootSize,
        (unit) => {
          summary.warnings.push(
            `Value "${describeRawValue(record.rawValue)}" for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}) uses "${unit}", which has no Figma equivalent — the unit was dropped and the number imported as-is.`
          );
        },
        (note) => {
          summary.warnings.push(
            `"${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${note}`
          );
        }
      );
    } catch (err) {
      // A value the parsers can't read at all (a colour spelling they don't
      // know, say) costs that one mode, not the whole import.
      summary.warnings.push(
        `Skipped value ${describeRawValue(record.rawValue)} for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
    const beforeRaw = (!varRef.isNew && !modeRef.isNew && varRef.real)
      ? varRef.real.valuesByMode[modeRef.modeId]
      : undefined;
    const before = await formatStoredValue(beforeRaw, varRef.resolvedType);
    const after = formatLiteral(newValue, record.resolvedType);

    const changed = !literalValueEquals(
      beforeRaw,
      newValue,
      record.resolvedType,
      typeof record.rawValue === "string"
    );
    diffEntry?.values.push({ modeName: record.modeName, before, after, changed });

    // Skip the write entirely when the stored value already matches — a
    // re-import of an unchanged file shouldn't touch the document at all.
    if (!changed) return;

    if (dryRun) {
      summary.valuesSet += 1;
    } else if (varRef.real) {
      try {
        varRef.real.setValueForMode(modeRef.modeId, newValue);
        summary.valuesSet += 1;
      } catch (err) {
        summary.warnings.push(
          `Failed to set value for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  };

  const aliasRecords: ImportRecord[] = [];

  for (const record of records) {
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;

    if (typeof record.rawValue === "string" && record.rawValue === "_unlinked") {
      summary.warnings.push(
        `Skipped unlinked reference for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}).`
      );
      continue;
    }
    if (isAliasValue(record.rawValue)) {
      aliasRecords.push(record);
      continue;
    }

    const varRef = variableRefsByPath.get(pathKey);
    const collRef = collectionRefsByName.get(record.collectionName);
    if (!varRef || !collRef) continue;

    const modeRef = collRef.modes.find((m) => m.name === record.modeName);
    if (!modeRef) continue;

    await applyLiteralValue(record, varRef, modeRef, variableDiffByPath.get(pathKey));
  }

  for (const record of aliasRecords) {
    const pathKey = `${record.collectionName} ${record.pathParts.join("/")}`;
    const varRef = variableRefsByPath.get(pathKey);
    const collRef = collectionRefsByName.get(record.collectionName);
    if (!varRef || !collRef) continue;

    const modeRef = collRef.modes.find((m) => m.name === record.modeName);
    if (!modeRef) continue;

    const candidates = resolveAliasCandidates(record.rawValue as string, record.collectionName, collectionRefsByName);

    let resolvedTarget: { modeRef: ModeRef; varRef: VariableRef } | undefined;
    for (const candidate of candidates) {
      const targetCollRef = collectionRefsByName.get(candidate.collectionName);
      if (!targetCollRef) continue;
      const targetModeRef = targetCollRef.modes.find((m) => m.name === candidate.modeName);
      if (!targetModeRef) continue;

      const targetPathKey = `${candidate.collectionName} ${candidate.path}`;
      let targetVarRef = variableRefsByPath.get(targetPathKey);
      if (!targetVarRef && targetCollRef.real) {
        const found = await findVariableByName(targetCollRef.real, candidate.path);
        if (found) {
          targetVarRef = { path: candidate.path, collectionName: candidate.collectionName, real: found, isNew: false, resolvedType: found.resolvedType };
        }
      }
      if (targetVarRef) {
        resolvedTarget = { modeRef: targetModeRef, varRef: targetVarRef };
        break;
      }
    }

    const diffEntry = variableDiffByPath.get(pathKey);

    if (!resolvedTarget) {
      // A STRING variable's real value can legitimately start with "$." — the
      // prefix alone never proves it's a reference. Having failed to match any
      // known collection/mode/variable, take the declared type at its word and
      // keep the value as the plain string it almost certainly is, rather than
      // discarding it.
      if (record.resolvedType === "STRING") {
        await applyLiteralValue(record, varRef, modeRef, diffEntry);
        continue;
      }
      summary.warnings.push(
        `Could not resolve alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): value "${record.rawValue}" did not match any known collection/mode/variable.`
      );
      diffEntry?.values.push({ modeName: record.modeName, before: undefined, after: "(unresolved alias)", changed: true });
      continue;
    }

    const beforeRaw = (!varRef.isNew && !modeRef.isNew && varRef.real)
      ? varRef.real.valuesByMode[modeRef.modeId]
      : undefined;
    const before = await formatStoredValue(beforeRaw, varRef.resolvedType);
    const after = `→ ${resolvedTarget.varRef.path}`;
    const changed = !aliasValueEquals(beforeRaw, resolvedTarget.varRef.real?.id);
    diffEntry?.values.push({ modeName: record.modeName, before, after, changed });

    // Already points at the right variable — skip the write.
    if (!changed) continue;

    if (dryRun) {
      summary.aliasesResolved += 1;
      summary.valuesSet += 1;
    } else if (varRef.real && resolvedTarget.varRef.real) {
      try {
        varRef.real.setValueForMode(modeRef.modeId, figma.variables.createVariableAlias(resolvedTarget.varRef.real));
        summary.aliasesResolved += 1;
        summary.valuesSet += 1;
      } catch (err) {
        summary.warnings.push(
          `Failed to set alias for "${record.pathParts.join("/")}" in "${record.collectionName}" (${record.modeName}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Reconcile "update" entries against what actually changed: a matched
  // variable whose description, scopes, code syntax and every mode's value
  // already equal the file is a true no-op, not an update, whether or not the
  // import touched the document.
  for (const [pathKey, diffEntry] of variableDiffByPath) {
    if (diffEntry.action !== "update") continue;
    const anyValueChanged = diffEntry.values.some((v) => v.changed);
    const metadataChanged = metadataChangedByPath.get(pathKey) ?? false;
    if (!anyValueChanged && !metadataChanged) {
      diffEntry.action = "unchanged";
    } else {
      summary.variablesUpdated += 1;
    }
  }

  // --- Phase 4: prune (SYNC only) — after merging, delete anything anywhere
  // in the document that isn't present in the imported file: whole
  // collections the file never mentions, and leftover variables/modes inside
  // collections it does mention.
  if (importMode === ImportMode.SYNC) {
    for (const collRef of collectionRefsByName.values()) {
      const modeNames = modeNamesByCollection.get(collRef.name);

      if (!modeNames) {
        // Not present in the file at all — delete the whole collection.
        diff.collections.push({ name: collRef.name, action: "delete" });
        summary.collectionsDeleted += 1;
        if (!dryRun && collRef.real) collRef.real.remove();
        continue;
      }

      if (collRef.real) {
        const keptVariableNames = new Set(
          records
            .filter((record) => record.collectionName === collRef.name)
            .map((record) => record.pathParts.join("/"))
        );

        const existingVariables = await Promise.all(
          collRef.real.variableIds.map((id) => figma.variables.getVariableByIdAsync(id))
        );
        for (const variable of existingVariables) {
          if (variable && !keptVariableNames.has(variable.name)) {
            diff.variables.push({ collectionName: collRef.name, path: variable.name, action: "delete", resolvedType: variable.resolvedType, values: [] });
            summary.variablesDeleted += 1;
            if (!dryRun) variable.remove();
          }
        }
      }

      for (const modeRef of collRef.modes) {
        if (modeNames.includes(modeRef.name)) continue;
        diff.modes.push({ collectionName: collRef.name, name: modeRef.name, action: "delete" });
        summary.modesDeleted += 1;
        if (!dryRun && collRef.real && !modeRef.isNew) {
          try {
            collRef.real.removeMode(modeRef.modeId);
          } catch (err) {
            summary.warnings.push(
              `Could not remove mode "${modeRef.name}" from collection "${collRef.name}": ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    }
  }

  return { summary, diff };
}

/**
 * Computes what an import would do — every collection/mode/variable/value
 * create, update or delete — without touching the document. Safe to call
 * freely for preview purposes.
 */
export async function previewImport(
  rawFiles: string[],
  importMode: ImportMode,
  rootFontSize: number = DEFAULT_ROOT_FONT_SIZE
): Promise<{ summary: ImportSummary; diff: ImportDiff }> {
  return runImport(rawFiles, importMode, true, rootFontSize);
}

/**
 * Imports a set of previously-exported VarVar JSON files into the current
 * Figma document: recreates collections, modes and variables, sets literal
 * values, and resolves the plugin's `$.Collection.Mode.path` alias-reference
 * convention back into real Figma variable aliases.
 *
 * @param rawFiles - Raw JSON text of each selected file
 * @param importMode - How to reconcile the import against existing local
 *   collections: additive merge, update-existing-only, merge-then-prune
 *   (sync), or wipe-then-import (clean). See {@link ImportMode}.
 * @param rootFontSize - What a `rem`/`em` value in the file is multiplied by to
 *   get the number Figma stores. Defaults to 16; an invalid value falls back to it.
 */
export async function importVariables(
  rawFiles: string[],
  importMode: ImportMode,
  rootFontSize: number = DEFAULT_ROOT_FONT_SIZE
): Promise<ImportSummary> {
  const { summary } = await runImport(rawFiles, importMode, false, rootFontSize);
  return summary;
}
