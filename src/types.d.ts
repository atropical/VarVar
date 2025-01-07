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

  export type OutputFormats =
  | "csv"
  | "json"
  | "css"
  | "js"
  | "ts"