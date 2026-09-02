import {
  SHADOW_LEVELS,
  TYPE_STEPS,
  type BreakpointTokens,
  type ContainerTokens,
  type CubicBezier,
  type DesignSystem,
  type DesignSystemV1,
  type MotionPreset,
  type MotionTokens,
  type Ramp,
  type ShadowLayer,
  type ShadowTokens,
  type SpacingTokens,
  type TypographyTokens,
} from "./types.ts";
import { getVibe } from "./vibes.ts";

/**
 * The token groups schema version 2 added, built from what a system already
 * has. Everything here is deterministic on its inputs, so a version-1 file
 * filled in on load produces the same tokens a fresh build would.
 */

/* ────────────────────────────── spacing ────────────────────────────── */

/** Spacing steps in rem. Published as `--space-*` in CSS and `spacing` in DESIGN.md. */
export const SPACING_STEPS = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16] as const;
export const spacingKey = (n: number) => String(n).replace(".", "-");

export function buildSpacing(): SpacingTokens {
  const scale: Record<string, string> = {};
  for (const n of SPACING_STEPS) scale[spacingKey(n)] = `${n}rem`;
  return { unit: "0.25rem", scale };
}

/* ────────────────────────────── shadows ────────────────────────────── */

/** `#rrggbb` plus an alpha as `#rrggbbaa`. */
export function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex.toLowerCase()}${a}`;
}

const layer = (x: number, y: number, blur: number, spread: number, color: string, alpha: number): ShadowLayer => ({
  x: `${x}px`,
  y: `${y}px`,
  blur: `${blur}px`,
  spread: `${spread}px`,
  color,
  alpha,
});

/**
 * Shadows tinted from the neutral ramp: the darkest neutral carries the
 * system's own hue, so a warm system throws a warm shadow. Dark mode gets a
 * denser, tighter set, since a faint shadow vanishes on a dark surface.
 */
export function buildShadows(neutral: Ramp): ShadowTokens {
  const tint = neutral["950"];
  return {
    xs: { light: [layer(0, 1, 2, 0, tint, 0.08)], dark: [layer(0, 1, 2, 0, tint, 0.4)] },
    sm: {
      light: [layer(0, 1, 3, 0, tint, 0.1), layer(0, 1, 2, -1, tint, 0.1)],
      dark: [layer(0, 1, 3, 0, tint, 0.45), layer(0, 1, 2, -1, tint, 0.45)],
    },
    md: {
      light: [layer(0, 4, 6, -1, tint, 0.1), layer(0, 2, 4, -2, tint, 0.1)],
      dark: [layer(0, 4, 6, -1, tint, 0.5), layer(0, 2, 4, -2, tint, 0.5)],
    },
    lg: {
      light: [layer(0, 10, 15, -3, tint, 0.1), layer(0, 4, 6, -4, tint, 0.1)],
      dark: [layer(0, 10, 15, -3, tint, 0.55), layer(0, 4, 6, -4, tint, 0.55)],
    },
    xl: {
      light: [layer(0, 20, 25, -5, tint, 0.1), layer(0, 8, 10, -6, tint, 0.1)],
      dark: [layer(0, 20, 25, -5, tint, 0.6), layer(0, 8, 10, -6, tint, 0.6)],
    },
  };
}

/** One CSS `box-shadow` value for a set of layers. */
export function shadowCss(layers: ShadowLayer[]): string {
  return layers.map((l) => `${l.x} ${l.y} ${l.blur} ${l.spread} ${hexAlpha(l.color, l.alpha)}`).join(", ");
}

/* ────────────────────────────── motion ────────────────────────────── */

const EASE_OUT: CubicBezier = [0.2, 0, 0, 1];
const EASE_IN_OUT: CubicBezier = [0.4, 0, 0.2, 1];
/** A firmer arrival than ease-out, still without overshoot. */
const EASE_EMPHASIZED: CubicBezier = [0.3, 0, 0, 1];

const MOTION_PRESETS: Record<MotionPreset, MotionTokens["duration"]> = {
  calm: { fast: "150ms", base: "250ms", slow: "400ms" },
  brisk: { fast: "100ms", base: "180ms", slow: "280ms" },
  lively: { fast: "120ms", base: "220ms", slow: "360ms" },
};

export const MOTION_PRESET_IDS = Object.keys(MOTION_PRESETS) as MotionPreset[];

export function buildMotion(preset: MotionPreset = "brisk"): MotionTokens {
  return {
    preset,
    duration: { ...MOTION_PRESETS[preset] },
    ease: { out: [...EASE_OUT], inOut: [...EASE_IN_OUT], emphasized: [...EASE_EMPHASIZED] },
  };
}

export function easeCss(curve: CubicBezier): string {
  return `cubic-bezier(${curve.join(", ")})`;
}

/* ─────────────────────────── typography ─────────────────────────── */

const LEADING: Record<(typeof TYPE_STEPS)[number], number> = {
  xs: 1.5,
  sm: 1.5,
  base: 1.5,
  lg: 1.4,
  xl: 1.3,
  "2xl": 1.25,
  "3xl": 1.2,
  "4xl": 1.1,
  "5xl": 1.05,
};

export function buildTypography(): TypographyTokens {
  return {
    leading: { ...LEADING },
    tracking: { tight: "-0.02em", normal: "0em", wide: "0.04em" },
    weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  };
}

/* ─────────────────────── breakpoints, containers ─────────────────────── */

export function buildBreakpoints(): BreakpointTokens {
  return { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", "2xl": "96rem" };
}

export function buildContainers(): ContainerTokens {
  return { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", measure: "65ch" };
}

/* ────────────────────────────── migration ────────────────────────────── */

/** The version-2 groups for a system that has everything else. */
export function tokenGroups(base: { vibe: string; colors: { neutral: Ramp } }, motion?: MotionPreset) {
  return {
    typography: buildTypography(),
    spacing: buildSpacing(),
    shadows: buildShadows(base.colors.neutral),
    motion: buildMotion(motion ?? getVibe(base.vibe)?.motion ?? "brisk"),
    breakpoints: buildBreakpoints(),
    containers: buildContainers(),
  };
}

/**
 * Bring a file from disk up to the current schema. Version 1 gains the six
 * token groups, derived from its own ramps and vibe; version 2 passes through.
 * Fields this version does not know are kept.
 */
export function migrateSystem(raw: DesignSystem | DesignSystemV1): DesignSystem {
  if ((raw as DesignSystem).schemaVersion === 2) return raw as DesignSystem;
  const v1 = raw as DesignSystemV1;
  const { schemaVersion: _v, ...rest } = v1;
  void _v;
  return { ...rest, ...tokenGroups(v1), schemaVersion: 2 };
}

export { SHADOW_LEVELS, TYPE_STEPS };
