export type Ramp = Record<string, string>; // "50".."950" -> hex

export interface ColorRamps {
  primary: Ramp;
  accent: Ramp;
  neutral: Ramp;
}

export interface Fonts {
  heading: string;
  body: string;
  mono: string;
}

/** Named steps of the type scale, smallest first. */
export const TYPE_STEPS = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"] as const;
export type TypeStep = (typeof TYPE_STEPS)[number];

export interface TypographyTokens {
  /** Unitless line height per type step. */
  leading: Record<TypeStep, number>;
  /** Letter spacing, em. */
  tracking: { tight: string; normal: string; wide: string };
  weights: { regular: number; medium: number; semibold: number; bold: number };
}

export interface SpacingTokens {
  /** The unit Tailwind multiplies (`--spacing`). */
  unit: string;
  /** Named steps, `--space-*` in CSS. Keys use `-` for the decimal point: "0-5" is 0.5rem. */
  scale: Record<string, string>;
}

export interface ShadowLayer {
  x: string;
  y: string;
  blur: string;
  spread: string;
  /** Six-digit hex; the tint comes from the neutral ramp. */
  color: string;
  alpha: number;
}

export const SHADOW_LEVELS = ["xs", "sm", "md", "lg", "xl"] as const;
export type ShadowLevel = (typeof SHADOW_LEVELS)[number];
export type ShadowTokens = Record<ShadowLevel, { light: ShadowLayer[]; dark: ShadowLayer[] }>;

export type MotionPreset = "calm" | "brisk" | "lively";
export type CubicBezier = [number, number, number, number];

export interface MotionTokens {
  preset: MotionPreset;
  /** CSS durations, e.g. "200ms". */
  duration: { fast: string; base: string; slow: string };
  ease: { out: CubicBezier; inOut: CubicBezier; emphasized: CubicBezier };
}

export interface BreakpointTokens {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
}

export interface ContainerTokens {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  /** Reading measure for prose, in ch. */
  measure: string;
}

export interface DesignSystem {
  /** Token format version. Version 2 added typography, spacing, shadows, motion, breakpoints and containers; version 1 files are filled in on load. */
  schemaVersion: 2;
  name: string;
  vibe: string;
  createdAt: string;
  colors: ColorRamps;
  semantic: {
    background: { light: string; dark: string };
    surface: { light: string; dark: string };
    text: { light: string; dark: string };
    mutedText: { light: string; dark: string };
    border: { light: string; dark: string };
    ring: string;
  };
  fonts: Fonts;
  radius: {
    style: "sharp" | "soft" | "round" | "pill";
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  typeScale: { ratio: number; baseRem: number };
  typography: TypographyTokens;
  spacing: SpacingTokens;
  shadows: ShadowTokens;
  motion: MotionTokens;
  breakpoints: BreakpointTokens;
  containers: ContainerTokens;
  /** Preconfigured gradient tokens (CSS background values). Optional. */
  gradients?: Record<string, string>;
  /** Reserved for later additions. Unknown keys are preserved on read and write. */
  extensions?: Record<string, unknown>;
}

/** A version-1 file on disk: everything above except the six token groups version 2 added. */
export type DesignSystemV1 = Omit<
  DesignSystem,
  "schemaVersion" | "typography" | "spacing" | "shadows" | "motion" | "breakpoints" | "containers"
> & { schemaVersion?: 1 };

export const RAMP_STOPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
