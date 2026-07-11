type NumericRange<
  START extends number,
  END extends number,
  ARR extends unknown[] = [],
  ACC extends number = never,
> = ARR["length"] extends END
  ? ACC | START | END
  : NumericRange<
      START,
      END,
      [...ARR, 1],
      ARR[START] extends undefined ? ACC : ACC | ARR["length"]
    >;

type Bit8 = NumericRange<0, 255>;
type Angle =
  | `${number}deg`
  | `${number}rad`
  | `${number}grad`
  | `${number}turn`
  | 0;
type Percentage = NumericRange<0, 100>;
type Opacity = NumericRange<0, 1>;

export interface RGB {
  r: Bit8;
  g: Bit8;
  b: Bit8;
}
export interface RGBA extends RGB {
  a: Opacity;
}
export interface HSL {
  h: Angle | number;
  s: Percentage;
  l: Percentage;
}
export interface HSLA extends HSL {
  a: Opacity;
}

type CssRGB = `rgb(${string})`;
type CssRGBA = `rgba(${string})`;
type CssHEX = `#${string}`;
type CssHSL = `hsl(${string})`;
type CssHSLA = `hsla(${string})`;
type CssVAR = `var(${string})`;
type CssGlobalValues = "inherit" | "initial" | "revert" | "unset";

export type CssColor =
  | "currentColor"
  | "transparent"
  | CssRGB
  | CssRGBA
  | CssHEX
  | CssHSL
  | CssHSLA
  | CssVAR
  | CssGlobalValues;

/**
 * Supported export formats for Figma variables
 */
export enum OutputFormats {
  CSV = "csv",
  JSON = "json", 
  CSS = "css",
  JS = "js",
  TS = "ts"
}

/**
 * Plugin command types for menu actions
 */
export enum PluginCommands {
  EXPORT_GENERIC = "export",
  EXPORT_JSON = "export-json",
  EXPORT_CSV = "export-csv",
  EXPORT_CSS = "export-css",
  EXPORT_JS = "export-js",
  IMPORT_JSON = "import-json"
}

/**
 * Message types for plugin communication
 */
export enum MessageTypes {
  // Info messages
  GET_BASIC_INFO = "INFO.GET_BASIC_INFO",
  BASIC_INFO = "INFO.BASIC_INFO",

  // Export messages
  EXPORT_SUCCESS = "EXPORT.SUCCESS",
  EXPORT_SUCCESS_RESULT = "EXPORT.SUCCESS.RESULT",
  EXPORT_ERROR = "EXPORT.ERROR",

  // Import messages
  IMPORT_PREVIEW_REQUEST = "IMPORT.PREVIEW.REQUEST",
  IMPORT_PREVIEW_RESULT = "IMPORT.PREVIEW.RESULT",
  IMPORT_REQUEST = "IMPORT.REQUEST",
  IMPORT_SUCCESS_RESULT = "IMPORT.SUCCESS.RESULT",
  IMPORT_ERROR = "IMPORT.ERROR"
}

/**
 * A single named file produced by an export utility. Exporters that can
 * split their output (e.g. extended-collection hierarchies) return an
 * array of these; single-file exports return a one-element array.
 */
export interface ExportFile {
  filename: string;
  content: string;
}

/**
 * How an import reconciles the imported file(s) against the document's
 * existing local variable collections.
 */
export enum ImportMode {
  /** Additive: create missing collections/modes/variables, update matches by name. Nothing is ever deleted. */
  MERGE = "merge",
  /** Touch only what already exists in both the file and the document (update values/description/scopes on matches). Nothing is created and nothing is deleted. */
  UPDATE_ONLY = "update-only",
  /** Merge (create + update), then delete any variable, mode, or whole collection anywhere in the document that isn't present in the imported file. */
  SYNC = "sync",
  /** Delete every existing local variable collection first, then import fresh — a full, clean re-sync. */
  CLEAN = "clean",
}

/**
 * Summary of an import run: counts of what was created/reused/updated/deleted,
 * plus any non-fatal warnings (unresolved aliases, `_unlinked` entries,
 * mode-limit errors, type mismatches) collected along the way.
 */
export interface ImportSummary {
  collectionsCreated: number;
  collectionsReused: number;
  collectionsDeleted: number;
  modesCreated: number;
  modesDeleted: number;
  variablesCreated: number;
  variablesUpdated: number;
  variablesDeleted: number;
  valuesSet: number;
  aliasesResolved: number;
  warnings: string[];
}

/** Itemized create/reuse/delete decision for a single collection, computed by a dry-run preview. */
export interface ImportDiffCollection {
  name: string;
  action: "create" | "reuse" | "delete";
}

/** Itemized create/delete decision for a single mode, computed by a dry-run preview. */
export interface ImportDiffMode {
  collectionName: string;
  name: string;
  action: "create" | "delete";
}

/** Before/after value for one mode of one variable, computed by a dry-run preview. */
export interface ImportDiffValue {
  modeName: string;
  before?: string;
  after: string;
  changed: boolean;
}

/**
 * Itemized create/update/delete decision for a single variable, plus its
 * per-mode value diffs. "unchanged" means the variable matched by name but
 * nothing about it (description, scopes, or any mode's value) actually
 * differs from the file — no write happens for it.
 */
export interface ImportDiffVariable {
  collectionName: string;
  path: string;
  action: "create" | "update" | "delete" | "unchanged";
  resolvedType: VariableResolvedDataType;
  values: ImportDiffValue[];
}

/**
 * The full itemized diff produced by a dry-run import preview — the same
 * decisions {@link importVariables} would make, without touching the
 * document. Shown to the user before they confirm the real run.
 */
export interface ImportDiff {
  collections: ImportDiffCollection[];
  modes: ImportDiffMode[];
  variables: ImportDiffVariable[];
}

/**
 * Plugin message interface for communication between UI and plugin code
 */
export interface PluginMessage {
  type: MessageTypes;
  command?: PluginCommands;
  format?: OutputFormats;
  useLinkedVarRowAndColPos?: boolean;
  useTailwindFormat?: boolean;
  useLegacyFormat?: boolean;
  count?: number;
  filename?: string;
  data?: string;
  files?: ExportFile[];
  usedExtendedCollections?: boolean;
  error?: string;
  editorType?: string;
  importFiles?: string[];
  importMode?: ImportMode;
  importSummary?: ImportSummary;
  importDiff?: ImportDiff;
}