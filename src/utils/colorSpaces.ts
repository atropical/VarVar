/**
 * Colour-space maths for the DTCG `color` type.
 *
 * The Design Tokens Color Module 2025.10
 * (https://www.designtokens.org/TR/2025.10/color/) defines a colour `$value` as
 * an object with a `colorSpace`, a `components` array, an optional `alpha` and
 * an optional `hex` fallback, and names fourteen colour spaces. It deliberately
 * does not restate the colour science: §2.1 says it "uses CSS Color Module
 * Level 4 for reference to concepts and terminology", including "technical
 * specifications for translating colors between color spaces".
 *
 * So every transfer function, matrix and algorithm below is taken from CSS
 * Color Module Level 4 — specifically its normative descriptions and the
 * sample conversion code in §17 "Sample code for color conversions"
 * (https://www.w3.org/TR/css-color-4/#color-conversion-code). Each constant
 * cites where it comes from. The rational-number matrices are reproduced as
 * the exact fractions that spec gives, evaluated at load time, so they carry no
 * transcription rounding of their own.
 *
 * Everything here converges on one destination: sRGB with 0-1 float channels,
 * which is the only thing a Figma variable can hold. Four of the fourteen
 * spaces are sRGB in different coordinates and convert exactly (see
 * {@link SRGB_LOSSLESS_SPACES}); the other ten can name colours sRGB cannot
 * reproduce. When one of those falls outside the sRGB gamut it is resolved in
 * this order:
 *
 * 1. The token's own `hex` fallback, if it has one. DTCG §4.1 defines that
 *    property as "a fallback value of the color", and this is the case it
 *    exists for — the author has already said which sRGB colour they want.
 * 2. Otherwise the CSS gamut mapping algorithm (see {@link gamutMapOklch}),
 *    which holds hue and lightness and reduces chroma.
 *
 * Either way the caller is handed a note (see {@link colorConversionNote}) so
 * it can warn: the imported colour is not the colour the file specifies.
 */

/** A three-component colour coordinate. */
type Vec3 = [number, number, number];

/** A 3x3 conversion matrix, row-major. */
type Mat3 = [Vec3, Vec3, Vec3];

/** Multiplies a 3x3 matrix by a column vector. */
function multiply(matrix: Mat3, vector: Vec3): Vec3 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

/** `Math.sign` that treats -0 as positive, so a signed power of 0 stays 0. */
function signOf(value: number): number {
  return value < 0 ? -1 : 1;
}

/**
 * Every `colorSpace` keyword the DTCG Color Module 2025.10 defines, in the
 * order of its §4.2 table. Nothing outside this list is a colour space this
 * plugin will read.
 */
export const DTCG_COLOR_SPACES = [
  "srgb",
  "srgb-linear",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d65",
  "xyz-d50",
] as const;

export type DtcgColorSpace = (typeof DTCG_COLOR_SPACES)[number];

const COLOR_SPACE_SET: ReadonlySet<string> = new Set(DTCG_COLOR_SPACES);

/**
 * The colour spaces whose entire gamut is sRGB's, so a conversion into sRGB is
 * exact and no colour can ever fall outside the destination.
 *
 * `srgb` is sRGB. `srgb-linear` is the same gamut with the transfer function
 * removed. `hsl` and `hwb` are, in the DTCG module's own words (§4.2.3, §4.2.4),
 * "a polar transformation of sRGB" — a change of coordinates, not of gamut.
 * Every other space in the table is either wider than sRGB (display-p3,
 * a98-rgb, prophoto-rgb, rec2020) or unbounded (lab, lch, oklab, oklch,
 * xyz-d65, xyz-d50), and can name colours sRGB cannot reproduce.
 */
export const SRGB_LOSSLESS_SPACES: ReadonlySet<DtcgColorSpace> = new Set<DtcgColorSpace>([
  "srgb",
  "srgb-linear",
  "hsl",
  "hwb",
]);

/* ------------------------------------------------------------------ *
 * Transfer functions
 * ------------------------------------------------------------------ */

/**
 * sRGB's electro-optical transfer function: gamma-encoded channel to linear.
 *
 * This is the piecewise curve from CSS Color 4 §17 (`lin_sRGB`), which matches
 * IEC 61966-2-1 — a linear segment below the 0.04045 breakpoint and a 2.4 power
 * with a 0.055 offset above it. A plain 2.2 power is a common approximation and
 * is wrong by up to ~1% in the shadows, which is visible on a re-export.
 *
 * Applied through the sign so out-of-range negative channels (which a
 * wide-gamut source legitimately produces mid-conversion) stay meaningful.
 */
function srgbToLinear(channel: number): number {
  const abs = Math.abs(channel);
  return abs <= 0.04045
    ? channel / 12.92
    : signOf(channel) * Math.pow((abs + 0.055) / 1.055, 2.4);
}

/**
 * sRGB's opto-electronic transfer function: linear channel to gamma-encoded.
 * The inverse of {@link srgbToLinear}; CSS Color 4 §17 `gam_sRGB`.
 */
function linearToSrgb(channel: number): number {
  const abs = Math.abs(channel);
  return abs > 0.0031308
    ? signOf(channel) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055)
    : 12.92 * channel;
}

/**
 * Display P3 shares sRGB's transfer function and differs only in its primaries
 * (CSS Color 4 §10.2 / §17 `lin_P3`).
 */
const p3ToLinear = srgbToLinear;

/**
 * A98 RGB's transfer function is a pure 563/256 (~2.19921875) power, applied
 * through the sign. CSS Color 4 §17 `lin_a98rgb`.
 */
function a98ToLinear(channel: number): number {
  return signOf(channel) * Math.pow(Math.abs(channel), 563 / 256);
}

/**
 * ProPhoto RGB: a 1/512 linear segment below Et = 16/512, a 1.8 power above.
 * CSS Color 4 §17 `lin_ProPhoto`.
 */
function prophotoToLinear(channel: number): number {
  const abs = Math.abs(channel);
  return abs <= 16 / 512 ? channel / 16 : signOf(channel) * Math.pow(abs, 1.8);
}

/**
 * Rec. 2020: a 4.5 linear segment below beta, a 1/0.45 power with the alpha
 * offset above. Constants and form from CSS Color 4 §17 `lin_2020`.
 */
function rec2020ToLinear(channel: number): number {
  const alpha = 1.09929682680944;
  const beta = 0.018053968510807;
  const abs = Math.abs(channel);
  return abs < beta * 4.5
    ? channel / 4.5
    : signOf(channel) * Math.pow((abs + alpha - 1) / alpha, 1 / 0.45);
}

/* ------------------------------------------------------------------ *
 * Matrices
 *
 * All reproduced from CSS Color 4 §17 "Sample code for color conversions"
 * (https://www.w3.org/TR/css-color-4/#color-conversion-code), which gives the
 * RGB-space matrices as exact rationals. Written as those fractions rather than
 * as decimals so nothing is lost in transcription.
 * ------------------------------------------------------------------ */

/** Linear-light sRGB to CIE XYZ, D65-referenced. CSS Color 4 §17 `lin_sRGB_to_XYZ`. */
const LIN_SRGB_TO_XYZ: Mat3 = [
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
];

/** CIE XYZ (D65) to linear-light sRGB. CSS Color 4 §17 `XYZ_to_lin_sRGB`. */
const XYZ_TO_LIN_SRGB: Mat3 = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
];

/** Linear-light Display P3 to CIE XYZ (D65). CSS Color 4 §17 `lin_P3_to_XYZ`. */
const LIN_P3_TO_XYZ: Mat3 = [
  [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
  [35783 / 156275, 247089 / 357200, 198249 / 2500400],
  [0 / 1, 32229 / 714400, 5220557 / 5000800],
];

/** Linear-light A98 RGB to CIE XYZ (D65). CSS Color 4 §17 `lin_a98rgb_to_XYZ`. */
const LIN_A98_TO_XYZ: Mat3 = [
  [573536 / 994567, 263643 / 1420810, 187206 / 994567],
  [591459 / 1989134, 6239551 / 9945670, 374412 / 4972835],
  [53769 / 1989134, 351524 / 4972835, 4929758 / 4972835],
];

/**
 * Linear-light ProPhoto RGB to CIE XYZ, **D50**-referenced — ProPhoto's native
 * white point. CSS Color 4 §17 `lin_ProPhoto_to_XYZ` gives this one as decimals,
 * so it is reproduced as decimals.
 */
const LIN_PROPHOTO_TO_XYZ_D50: Mat3 = [
  [0.7977666449006423, 0.1351812974005331, 0.0313477341283922],
  [0.2880748288194013, 0.7118352342418731, 0.0000899369387256],
  [0, 0, 0.8251046025104602],
];

/** Linear-light Rec. 2020 to CIE XYZ (D65). CSS Color 4 §17 `lin_2020_to_XYZ`. */
const LIN_REC2020_TO_XYZ: Mat3 = [
  [63426534 / 99577255, 20160776 / 139408157, 47086771 / 278816314],
  [26158966 / 99577255, 472592308 / 697040785, 8267143 / 139408157],
  [0 / 1, 19567812 / 697040785, 295819943 / 278816314],
];

/**
 * Bradford chromatic adaptation, D50-adapted XYZ to D65-adapted XYZ.
 *
 * CSS Color 4 §17 `D50_to_D65`. The XYZ spaces in the DTCG table are two
 * different white points, not two different encodings: `xyz-d50` (and `lab`,
 * `lch`, `prophoto-rgb`, which are all D50-referenced) must be adapted before
 * they can be mixed with the D65-referenced spaces, or every colour comes out
 * with a warm/cool cast. Bradford is the transform CSS Color 4 specifies.
 */
const XYZ_D50_TO_D65: Mat3 = [
  [0.955473421813335, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];

/**
 * CIE XYZ (D65) to the cone response domain OKLab is built on, and the second
 * matrix that turns the (cube-rooted) cone responses into OKLab.
 *
 * CSS Color 4 §17 `XYZ_to_OKLab`, which credits Björn Ottosson's original
 * derivation (https://bottosson.github.io/posts/oklab/). The values there are
 * the higher-precision ones CSS Color 4 adopted, not the 8-digit ones in the
 * original blog post.
 */
const XYZ_TO_LMS: Mat3 = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];

const LMS_TO_OKLAB: Mat3 = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.42859224204848, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

/** OKLab back to the cone response domain. CSS Color 4 §17 `OKLab_to_XYZ`. */
const OKLAB_TO_LMS: Mat3 = [
  [1.0, 0.3963377773761749, 0.2158037573099136],
  [1.0, -0.1055613458156586, -0.0638541728258133],
  [1.0, -0.0894841775298119, -1.2914855480194092],
];

/** Cone responses back to CIE XYZ (D65). CSS Color 4 §17 `OKLab_to_XYZ`. */
const LMS_TO_XYZ: Mat3 = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];

/**
 * The D50 reference white CIELAB is defined against, as CSS Color 4 §17 states
 * it: the ASTM E308-01 chromaticity (0.3457, 0.3585) with Y = 1.
 */
const D50_WHITE: Vec3 = [
  0.3457 / 0.3585,
  1,
  (1 - 0.3457 - 0.3585) / 0.3585,
];

/** CIELAB's epsilon (216/24389) and kappa (24389/27). CSS Color 4 §17. */
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

/* ------------------------------------------------------------------ *
 * Polar sRGB models
 * ------------------------------------------------------------------ */

/**
 * HSL to sRGB, exactly as CSS Color 4 §7.1 specifies it (the `hslToRgb`
 * reference implementation). Hue in degrees, saturation and lightness in
 * 0-100 — which is the range the DTCG Color Module's §4.2.3 table gives.
 *
 * Lossless: HSL is a coordinate change on sRGB, so nothing is clipped.
 */
function hslToSrgb([hue, saturation, lightness]: Vec3): Vec3 {
  const h = ((hue % 360) + 360) % 360;
  const s = saturation / 100;
  const l = lightness / 100;

  const channel = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };

  return [channel(0), channel(8), channel(4)];
}

/**
 * HWB to sRGB, as CSS Color 4 §8.1 specifies it (the `hwbToRgb` reference
 * implementation). Hue in degrees, whiteness and blackness in 0-100 per the
 * DTCG Color Module §4.2.4 table.
 *
 * Lossless, for the same reason HSL is.
 */
function hwbToSrgb([hue, whiteness, blackness]: Vec3): Vec3 {
  const w = whiteness / 100;
  const b = blackness / 100;

  if (w + b >= 1) {
    const gray = w / (w + b);
    return [gray, gray, gray];
  }

  const rgb = hslToSrgb([hue, 100, 50]);
  return [
    rgb[0] * (1 - w - b) + w,
    rgb[1] * (1 - w - b) + w,
    rgb[2] * (1 - w - b) + w,
  ] as Vec3;
}

/* ------------------------------------------------------------------ *
 * XYZ conversions
 * ------------------------------------------------------------------ */

/** CIELAB (L 0-100, a/b signed) to CIE XYZ, D50-referenced. CSS Color 4 §17 `Lab_to_XYZ`. */
function labToXyzD50([l, a, b]: Vec3): Vec3 {
  const f1 = (l + 16) / 116;
  const f0 = a / 500 + f1;
  const f2 = f1 - b / 200;

  const x = Math.pow(f0, 3) > LAB_EPSILON ? Math.pow(f0, 3) : (116 * f0 - 16) / LAB_KAPPA;
  const y = l > LAB_KAPPA * LAB_EPSILON ? Math.pow((l + 16) / 116, 3) : l / LAB_KAPPA;
  const z = Math.pow(f2, 3) > LAB_EPSILON ? Math.pow(f2, 3) : (116 * f2 - 16) / LAB_KAPPA;

  return [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]];
}

/** OKLab to CIE XYZ (D65). CSS Color 4 §17 `OKLab_to_XYZ`. */
function oklabToXyzD65(oklab: Vec3): Vec3 {
  const lms = multiply(OKLAB_TO_LMS, oklab);
  const cubed: Vec3 = [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3];
  return multiply(LMS_TO_XYZ, cubed);
}

/** CIE XYZ (D65) to OKLab. CSS Color 4 §17 `XYZ_to_OKLab`. */
function xyzD65ToOklab(xyz: Vec3): Vec3 {
  const lms = multiply(XYZ_TO_LMS, xyz);
  const rooted = lms.map((value) => Math.cbrt(value)) as Vec3;
  return multiply(LMS_TO_OKLAB, rooted);
}

/**
 * Polar to rectangular for the two LCH models: `a = C·cos(H)`, `b = C·sin(H)`,
 * with H in degrees. CSS Color 4 §9.3 / §17 `LCH_to_Lab`, `OKLCH_to_OKLab`.
 */
function lchToLab([lightness, chroma, hue]: Vec3): Vec3 {
  const radians = (hue * Math.PI) / 180;
  return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
}

/** Rectangular to polar, the inverse of {@link lchToLab}. CSS Color 4 §17 `Lab_to_LCH`. */
function labToLch([lightness, a, b]: Vec3): Vec3 {
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return [lightness, Math.sqrt(a * a + b * b), hue >= 0 ? hue : hue + 360];
}

/**
 * Any DTCG colour space's components, expressed as CIE XYZ with a D65 white
 * point — the common ground every conversion here passes through.
 *
 * The D50-referenced spaces (`lab`, `lch`, `prophoto-rgb`, `xyz-d50`) are
 * Bradford-adapted to D65 on the way out.
 */
function toXyzD65(space: DtcgColorSpace, components: Vec3): Vec3 {
  switch (space) {
    case "srgb":
      return multiply(LIN_SRGB_TO_XYZ, components.map(srgbToLinear) as Vec3);
    case "srgb-linear":
      return multiply(LIN_SRGB_TO_XYZ, components);
    case "hsl":
      return multiply(LIN_SRGB_TO_XYZ, hslToSrgb(components).map(srgbToLinear) as Vec3);
    case "hwb":
      return multiply(LIN_SRGB_TO_XYZ, hwbToSrgb(components).map(srgbToLinear) as Vec3);
    case "display-p3":
      return multiply(LIN_P3_TO_XYZ, components.map(p3ToLinear) as Vec3);
    case "a98-rgb":
      return multiply(LIN_A98_TO_XYZ, components.map(a98ToLinear) as Vec3);
    case "rec2020":
      return multiply(LIN_REC2020_TO_XYZ, components.map(rec2020ToLinear) as Vec3);
    case "prophoto-rgb":
      return multiply(
        XYZ_D50_TO_D65,
        multiply(LIN_PROPHOTO_TO_XYZ_D50, components.map(prophotoToLinear) as Vec3)
      );
    case "lab":
      return multiply(XYZ_D50_TO_D65, labToXyzD50(components));
    case "lch":
      return multiply(XYZ_D50_TO_D65, labToXyzD50(lchToLab(components)));
    case "oklab":
      return oklabToXyzD65(components);
    case "oklch":
      return oklabToXyzD65(lchToLab(components));
    case "xyz-d65":
      return components;
    case "xyz-d50":
      return multiply(XYZ_D50_TO_D65, components);
  }
}

/** CIE XYZ (D65) to gamma-encoded sRGB, unclipped — channels may fall outside 0-1. */
function xyzD65ToSrgb(xyz: Vec3): Vec3 {
  return multiply(XYZ_TO_LIN_SRGB, xyz).map(linearToSrgb) as Vec3;
}

/** Gamma-encoded sRGB to OKLab, via linear sRGB and XYZ D65. */
function srgbToOklab(rgb: Vec3): Vec3 {
  return xyzD65ToOklab(multiply(LIN_SRGB_TO_XYZ, rgb.map(srgbToLinear) as Vec3));
}

/** OKLCH to gamma-encoded sRGB, unclipped. */
function oklchToSrgb(oklch: Vec3): Vec3 {
  return xyzD65ToSrgb(oklabToXyzD65(lchToLab(oklch)));
}

/* ------------------------------------------------------------------ *
 * Gamut mapping
 * ------------------------------------------------------------------ */

/** How far outside 0-1 a channel may sit and still count as in-gamut. */
const GAMUT_EPSILON = 1e-6;

/** Whether every channel of a gamma-encoded sRGB colour is within 0-1. */
function isInSrgbGamut([r, g, b]: Vec3): boolean {
  return [r, g, b].every((c) => c >= -GAMUT_EPSILON && c <= 1 + GAMUT_EPSILON);
}

/** Clamps every channel into 0-1. */
function clipToSrgb([r, g, b]: Vec3): Vec3 {
  const clamp = (c: number) => (c < 0 ? 0 : c > 1 ? 1 : c);
  return [clamp(r), clamp(g), clamp(b)];
}

/** Euclidean distance in OKLab — the deltaEOK of CSS Color 4 §18.4. */
function deltaEOK(a: Vec3, b: Vec3): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * Maps an out-of-gamut colour to the nearest sRGB colour, using the CSS gamut
 * mapping algorithm of CSS Color 4 §13.2
 * (https://www.w3.org/TR/css-color-4/#css-gamut-mapping).
 *
 * The algorithm holds OKLCH lightness and hue fixed and binary-searches for the
 * largest chroma whose clipped sRGB rendering is still within one just-
 * noticeable difference (deltaEOK < 0.02) of the unclipped colour. That
 * preserves hue and lightness — the two things a designer notices — where naive
 * per-channel clipping shifts both (clipping a saturated P3 red turns it
 * measurably orange).
 *
 * The DTCG Color Module's §5 is explicit that gamut mapping is left to the
 * translation tool ("translation tools MAY use the gamut mapping algorithm that
 * best fits the use case"), so this is a choice, not a requirement. The CSS
 * algorithm is chosen because the module points at CSS Color 4 for exactly this
 * kind of question.
 *
 * @param oklch - The out-of-gamut colour in OKLCH
 * @returns The nearest in-gamut sRGB colour, channels in 0-1
 */
function gamutMapOklch(oklch: Vec3): Vec3 {
  const [lightness] = oklch;

  // Above white and below black there is nothing to search for.
  if (lightness >= 1) return [1, 1, 1];
  if (lightness <= 0) return [0, 0, 0];

  const JND = 0.02;
  const EPSILON = 0.0001;

  let min = 0;
  let max = oklch[1];
  let minInGamut = true;
  let clipped = clipToSrgb(oklchToSrgb(oklch));

  while (max - min > EPSILON) {
    const chroma = (min + max) / 2;
    const current: Vec3 = [oklch[0], chroma, oklch[2]];
    const currentRgb = oklchToSrgb(current);

    if (minInGamut && isInSrgbGamut(currentRgb)) {
      min = chroma;
      continue;
    }

    clipped = clipToSrgb(currentRgb);
    // deltaEOK between the clipped rendering and the colour it was clipped
    // from, both in OKLab. `current` is already OKLCH, so it only needs the
    // polar-to-rectangular step.
    const error = deltaEOK(srgbToOklab(clipped), lchToLab(current));

    if (error < JND) {
      if (JND - error < EPSILON) return clipped;
      minInGamut = false;
      min = chroma;
    } else {
      max = chroma;
    }
  }

  return clipped;
}

/* ------------------------------------------------------------------ *
 * The DTCG colour value
 * ------------------------------------------------------------------ */

/**
 * The DTCG Color Module's `$value` object (§4.1).
 *
 * `colorSpace` and `components` are required; `alpha` defaults to 1 when
 * omitted; `hex` is an optional fallback which the spec requires to be
 * "formatted in 6 digit CSS hex color notation ... to avoid conflicts with the
 * provided alpha value".
 */
export interface DtcgColorValue {
  colorSpace: DtcgColorSpace;
  components: number[];
  alpha?: number;
  hex?: string;
}

/** Whether a string names one of the fourteen DTCG colour spaces. */
function isDtcgColorSpace(value: unknown): value is DtcgColorSpace {
  return typeof value === "string" && COLOR_SPACE_SET.has(value);
}

/**
 * Whether a raw `$value` is shaped like the DTCG colour object at all — enough
 * to route it to {@link parseDtcgColorValue} rather than to the CSS-string
 * parser. Deliberately loose: a `colorSpace`/`components` pair that turns out
 * to be malformed should produce a specific error, not silently fall through to
 * a parser that will only say "unrecognized".
 */
export function isDtcgColorObject(raw: unknown): raw is Record<string, unknown> {
  return (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    "colorSpace" in raw &&
    "components" in raw
  );
}

/** The outcome of reading a colour out of a token file. */
export interface ParsedTokenColor {
  /** The colour as Figma stores it: sRGB, 0-1 float channels, plus alpha. */
  rgba: RGBA;
  /** The space the file named, or `undefined` for a plain CSS colour string. */
  colorSpace?: DtcgColorSpace;
  /** True when the source space can exceed sRGB, so the value is not exact. */
  converted: boolean;
  /** True when the colour actually fell outside sRGB and had to be mapped. */
  gamutMapped: boolean;
  /** True when the mapped colour came from the file's own `hex` fallback. */
  usedHexFallback: boolean;
}

/**
 * Reads one element of the `components` array.
 *
 * The DTCG Color Module §4.1 says each element "MUST be either a number [or]
 * the 'none' keyword". §4.1.1 explains what `none` means — a component that is
 * "missing, or not applicable" — and defers its behaviour to CSS Color 4, which
 * introduced the keyword. CSS Color 4 §4.4 is the rule that matters here: when
 * a colour with missing components is converted or rendered rather than
 * interpolated, "the missing components are replaced with zero". So `none`
 * becomes 0.
 *
 * The distinction the module draws in §4.1.1 — that `hsl(none, 0, 100)` may
 * interpolate differently from `hsl(0, 0, 100)` — is a distinction about
 * interpolation, and there is nowhere in a Figma variable to record it: a Figma
 * COLOR variable is four floats. So the colour is imported and the analytic
 * hue is dropped, which is the same thing a browser does when it paints one.
 */
function readComponent(raw: unknown, index: number, space: string): number {
  if (raw === "none") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  throw new Error(
    `component ${index} of the "${space}" color is ${JSON.stringify(raw)}, which is neither a number nor the "none" keyword`
  );
}

/**
 * Reads the optional `alpha`. DTCG §4.1: "A number that represents the alpha
 * value of the color. This value is between 0 and 1 ... If omitted, the alpha
 * value of the color MUST be assumed to be 1 (fully opaque)."
 *
 * An out-of-range alpha is clamped rather than rejected — the colour is still
 * unambiguous, and Figma will not accept anything outside 0-1.
 */
function readAlpha(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "none") return 1;
  const value = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(value)) {
    throw new Error(`alpha is ${JSON.stringify(raw)}, which is not a number`);
  }
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Converts a DTCG colour `$value` object into the sRGB 0-1 quadruple a Figma
 * variable holds.
 *
 * All fourteen colour spaces of the module's §4.2 table are accepted. The four
 * sRGB-gamut spaces convert exactly; the other ten are converted to the nearest
 * sRGB colour, and the result says so (`converted`, and `gamutMapped` when the
 * colour really was outside sRGB) so the caller can warn.
 *
 * Throws when the object names a space that isn't in the table, or when the
 * components don't parse — the caller treats that as a value it cannot import.
 *
 * @param raw - The `$value` object read out of the file
 */
export function parseDtcgColorValue(raw: Record<string, unknown>): ParsedTokenColor {
  const space = raw.colorSpace;
  if (!isDtcgColorSpace(space)) {
    throw new Error(
      `unsupported color space ${JSON.stringify(space)} — the Design Tokens Color Module defines ${DTCG_COLOR_SPACES.join(", ")}`
    );
  }

  const rawComponents = raw.components;
  if (!Array.isArray(rawComponents) || rawComponents.length < 3) {
    throw new Error(
      `the "${space}" color has ${Array.isArray(rawComponents) ? rawComponents.length : "no"} components; all fourteen DTCG color spaces take three`
    );
  }

  const components: Vec3 = [
    readComponent(rawComponents[0], 0, space),
    readComponent(rawComponents[1], 1, space),
    readComponent(rawComponents[2], 2, space),
  ];
  const alpha = readAlpha(raw.alpha);

  // The sRGB-gamut spaces convert exactly and never need mapping.
  if (SRGB_LOSSLESS_SPACES.has(space)) {
    const rgb =
      space === "srgb"
        ? components
        : space === "srgb-linear"
          ? (components.map(linearToSrgb) as Vec3)
          : space === "hsl"
            ? hslToSrgb(components)
            : hwbToSrgb(components);
    // HSL/HWB arithmetic can leave a channel a few ULPs outside 0-1, and Figma
    // rejects those, so the exact result is still clamped — but no colour was
    // moved, so nothing is reported as mapped.
    const [r, g, b] = clipToSrgb(rgb);
    return { rgba: { r, g, b, a: alpha } as RGBA, colorSpace: space, converted: false, gamutMapped: false, usedHexFallback: false };
  }

  const xyz = toXyzD65(space, components);
  const unclipped = xyzD65ToSrgb(xyz);

  if (isInSrgbGamut(unclipped)) {
    // Inside sRGB the conversion is exact, and an exact conversion is more
    // precise than the file's 8-bit-per-channel `hex` could ever be, so the
    // fallback is deliberately ignored here.
    const [r, g, b] = clipToSrgb(unclipped);
    return { rgba: { r, g, b, a: alpha } as RGBA, colorSpace: space, converted: true, gamutMapped: false, usedHexFallback: false };
  }

  // Out of gamut, and the file supplied a fallback. DTCG §4.1 defines `hex` as
  // "a string that represents a fallback value of the color" — this is the
  // situation it exists for, and it is the author saying, in the file, which
  // sRGB colour they want when theirs can't be reproduced. That beats any
  // algorithm this plugin might pick on their behalf.
  //
  // Only the RGB channels come from it: §4.1 requires the hex to be 6-digit
  // "to avoid conflicts with the provided alpha value", so alpha still comes
  // from `alpha`.
  const fallback = readHexFallback(raw.hex);
  if (fallback) {
    const [r, g, b] = fallback;
    return { rgba: { r, g, b, a: alpha } as RGBA, colorSpace: space, converted: true, gamutMapped: true, usedHexFallback: true };
  }

  const [r, g, b] = gamutMapOklch(labToLch(xyzD65ToOklab(xyz)));
  return { rgba: { r, g, b, a: alpha } as RGBA, colorSpace: space, converted: true, gamutMapped: true, usedHexFallback: false };
}

/**
 * Reads the optional `hex` fallback. DTCG §4.1 requires "6 digit CSS hex color
 * notation"; the 3-digit shorthand is accepted too, since it is unambiguous and
 * costs nothing to allow. Anything else is ignored rather than rejected — a
 * malformed fallback is no reason to refuse a colour whose `components` are
 * perfectly well-formed.
 *
 * @param raw - The leaf's `hex` property
 */
function readHexFallback(raw: unknown): Vec3 | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  if (!match) return undefined;
  const digits = match[1].length === 3
    ? match[1].split("").map((c) => c + c).join("")
    : match[1];
  return [
    parseInt(digits.slice(0, 2), 16) / 255,
    parseInt(digits.slice(2, 4), 16) / 255,
    parseInt(digits.slice(4, 6), 16) / 255,
  ];
}

/**
 * The warning a converted colour deserves, or `undefined` when the value maps
 * into sRGB exactly and there is nothing to say.
 *
 * Figma variables are sRGB with 0-1 channels and there is no way to store
 * anything else, so a token authored in a wider or unbounded space cannot be
 * imported without being changed. The import goes ahead — an unimportable
 * design system is worse than an approximated one — but it says what it did,
 * naming the source space, and distinguishes a colour that genuinely had to
 * move from one that merely passed through a wide-gamut spelling.
 *
 * @param parsed - The outcome of {@link parseDtcgColorValue}
 */
export function colorConversionNote(parsed: ParsedTokenColor): string | undefined {
  if (!parsed.converted || !parsed.colorSpace) return undefined;

  if (!parsed.gamutMapped) {
    return `the color is defined in the "${parsed.colorSpace}" color space, which Figma variables cannot store, so it was converted to sRGB. It was already inside the sRGB gamut, so nothing was clipped.`;
  }
  return parsed.usedHexFallback
    ? `the color is defined in the "${parsed.colorSpace}" color space and falls outside the sRGB gamut. Figma variables are sRGB, so it was gamut-mapped — to the file's own "hex" fallback — and is no longer the exact color the components specify.`
    : `the color is defined in the "${parsed.colorSpace}" color space and falls outside the sRGB gamut. Figma variables are sRGB, so it was gamut-mapped to the nearest sRGB color (the CSS Color 4 OKLCH chroma-reduction algorithm) and is no longer the exact color the file specifies. Giving the token a "hex" fallback would let you choose the sRGB color yourself.`;
}
