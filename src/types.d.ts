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
  EXPORT_JS = "export-js"
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
  EXPORT_ERROR = "EXPORT.ERROR"
}

/**
 * Plugin message interface for communication between UI and plugin code
 */
export interface PluginMessage {
  type: MessageTypes;
  command?: PluginCommands;
  format?: OutputFormats;
  useLinkedVarRowAndColPos?: boolean;
  count?: number;
  filename?: string;
  data?: string;
  error?: string;
  editorType?: string;
}