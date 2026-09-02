import { RAMP_STOPS, type Ramp } from "./types.ts";

// ---------- sRGB <-> linear ----------
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// ---------- HSL <-> RGB ----------
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0), f(8), f(4)];
}

// ---------- RGB <-> Hex ----------
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [parseInt(m.slice(0, 2), 16) / 255, parseInt(m.slice(2, 4), 16) / 255, parseInt(m.slice(4, 6), 16) / 255];
}

// ---------- OKLab / OKLCH (Björn Ottosson's matrices) ----------
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

function linRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToLinRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const [L, a, bb] = linRgbToOklab(r, g, b);
  const c = Math.sqrt(a * a + bb * bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function oklchToLinRgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  return oklabToLinRgb(l, Math.cos(hr) * c, Math.sin(hr) * c);
}

const inGamut = ([r, g, b]: [number, number, number]) =>
  r >= -1e-4 && r <= 1.0001 && g >= -1e-4 && g <= 1.0001 && b >= -1e-4 && b <= 1.0001;

/** Convert OKLCH to hex, reducing chroma if needed to stay inside sRGB gamut. */
export function oklchToHex(color: Oklch): string {
  let { l, c } = color;
  let rgb = oklchToLinRgb(color);
  if (!inGamut(rgb)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const test = oklchToLinRgb({ ...color, c: mid });
      if (inGamut(test)) lo = mid;
      else hi = mid;
    }
    c = lo;
    rgb = oklchToLinRgb({ ...color, c });
  }
  const [r, g, b] = rgb.map(toGamma) as [number, number, number];
  return rgbToHex(r, g, b);
}

// ---------- Ramps ----------
const TARGET_L: Record<string, number> = {
  "50": 0.975, "100": 0.94, "200": 0.88, "300": 0.8, "400": 0.71,
  "500": 0.61, "600": 0.52, "700": 0.43, "800": 0.35, "900": 0.27, "950": 0.19,
};
const CHROMA_FACTOR: Record<string, number> = {
  "50": 0.28, "100": 0.38, "200": 0.52, "300": 0.68, "400": 0.86,
  "500": 1, "600": 0.97, "700": 0.84, "800": 0.68, "900": 0.55, "950": 0.42,
};

export interface RampOptions {
  chromaScale?: number;
  /** Compress the lightness span (e.g. [0.46, 0.94]) so ramps read as fewer, louder solids. */
  lRange?: [number, number];
}

const L_MIN = TARGET_L["950"];
const L_MAX = TARGET_L["50"];

/** Build an 11-stop perceptual ramp from a seed color, preserving its hue. */
export function buildRamp(seedHex: string, opts: RampOptions = {}): Ramp {
  const base = hexToOklch(seedHex);
  const [lo, hi] = opts.lRange ?? [L_MIN, L_MAX];
  const k = (hi - lo) / (L_MAX - L_MIN);
  const ramp: Ramp = {};
  for (const stop of RAMP_STOPS) {
    ramp[stop] = oklchToHex({
      l: lo + (TARGET_L[stop] - L_MIN) * k,
      c: base.c * CHROMA_FACTOR[stop] * (opts.chromaScale ?? 1),
      h: base.h,
    });
  }
  return ramp;
}

/** Tinted neutral ramp (warm/cool/none). */
export function buildNeutral(tintHue?: number): Ramp {
  const ramp: Ramp = {};
  for (const stop of RAMP_STOPS) {
    ramp[stop] = oklchToHex({
      l: TARGET_L[stop],
      c: tintHue === undefined ? 0 : 0.006 + CHROMA_FACTOR[stop] * 0.016,
      h: tintHue ?? 0,
    });
  }
  return ramp;
}

// ---------- Harmonies ----------
export type Harmony = "analogous" | "complementary" | "triadic" | "monochrome";

export function harmonize(seedHex: string, harmony: Harmony): string {
  const { l, c, h } = hexToOklch(seedHex);
  const shift: Record<Harmony, number> = {
    monochrome: 0,
    analogous: 40,
    complementary: 180,
    triadic: 120,
  };
  return oklchToHex({ l: Math.min(0.85, Math.max(0.45, l)), c: Math.max(c, 0.09), h: h + shift[harmony] });
}

/**
 * OKLCH components in the DTCG 2025.10 shape: [L, C, H]. Hue is "none" for an
 * achromatic colour, where it carries no information, which the format allows.
 */
export function oklchComponents(hex: string): [number, number, number | "none"] {
  const { l, c, h } = hexToOklch(hex);
  const round = (n: number, places: number) => Number(n.toFixed(places));
  const chroma = round(c, 4);
  return [round(l, 4), chroma, chroma === 0 ? "none" : round(h, 3)];
}

/** CSS `oklch()` for a hex, the form shadcn themes are written in. */
export function oklchCss(hex: string): string {
  const [l, c, h] = oklchComponents(hex);
  return `oklch(${l} ${c} ${h === "none" ? 0 : h})`;
}

/** WCAG 2.x relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function randomSeed(): string {
  const h = Math.floor(Math.random() * 360);
  const c = 0.1 + Math.random() * 0.14;
  const l = 0.5 + Math.random() * 0.15;
  return oklchToHex({ l, c, h });
}

/**
 * Opinionated gradient tokens derived from a system's own ramps, so they stay
 * coherent when hues shift. A third accent hue is synthesized away from the
 * primary: bold pops for loud palettes, analogous whispers for quiet ones.
 */
export function buildGradients(colors: { primary: Ramp; accent: Ramp; neutral: Ramp }): Record<string, string> {
  const p = hexToOklch(colors.primary["600"]);
  const quiet = p.c < 0.11;
  const third = oklchToHex({
    l: quiet ? 0.6 : 0.66,
    c: quiet ? Math.max(0.04, p.c) : Math.min(0.21, Math.max(0.14, p.c)),
    h: p.h + (quiet ? 45 : 85),
  });
  return {
    primary: `linear-gradient(120deg, ${colors.accent["400"]} 0%, ${colors.primary["500"]} 52%, ${colors.primary["800"]} 100%)`,
    mesh: [
      `radial-gradient(60% 85% at 12% 8%, ${colors.accent["300"]}55 0%, transparent 60%)`,
      `radial-gradient(55% 75% at 88% 10%, ${third}63 0%, transparent 58%)`,
      `radial-gradient(80% 95% at 55% 96%, ${colors.primary["500"]}40 0%, transparent 62%)`,
      `linear-gradient(180deg, ${colors.neutral["900"]}, ${colors.neutral["950"]})`,
    ].join(", "),
    text: `linear-gradient(92deg, ${colors.accent["500"]} 0%, ${colors.primary["400"]} 55%, ${third} 100%)`,
  };
}
