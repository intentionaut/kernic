import { buildGradients, buildNeutral, buildRamp } from "./color.ts";
import { tokenGroups } from "./tokens.ts";
import type { DesignSystem, MotionPreset, Ramp } from "./types.ts";
import { RADIUS_PRESETS, type RadiusStyle, type Vibe } from "./vibes.ts";

export function rampsFromVibe(vibe: Vibe): { primary: Ramp; accent: Ramp; neutral: Ramp } {
  const compress = { chromaScale: vibe.chromaScale, lRange: vibe.lRange };
  return {
    primary: buildRamp(vibe.primarySeed, compress),
    accent: buildRamp(vibe.accentSeed, compress),
    neutral: buildNeutral(vibe.neutralTintHue),
  };
}

export function semanticFromRamps(
  colors: DesignSystem["colors"],
  darkDefault: boolean
): DesignSystem["semantic"] {
  const n = colors.neutral;
  const p = colors.primary;
  return {
    background: { light: n["50"], dark: n["950"] },
    surface: { light: n["100"], dark: n["900"] },
    text: { light: n["950"], dark: n["50"] },
    mutedText: { light: n["600"], dark: n["400"] },
    border: { light: n["200"], dark: n["800"] },
    ring: darkDefault ? p["500"] : p["600"],
  };
}

/**
 * Assembles a full DesignSystem from already-decided pieces (colors, fonts,
 * radius, ratio). Shared by buildFromVibe (below) and the wizard's custom
 * flow, so there's exactly one place that knows the DesignSystem shape.
 * `createdAt` is injectable so callers (and tests) don't depend on the clock.
 */
export function buildDesignSystem(params: {
  name: string;
  vibeId: string;
  colors: DesignSystem["colors"];
  darkDefault: boolean;
  fonts: DesignSystem["fonts"];
  radiusStyle: RadiusStyle;
  radius: { sm: string; md: string; lg: string; xl: string };
  ratio: number;
  /** Motion preset. Defaults to the vibe's, or brisk for a custom system. */
  motion?: MotionPreset;
  createdAt?: string;
}): DesignSystem {
  return {
    schemaVersion: 2,
    name: params.name,
    vibe: params.vibeId,
    createdAt: params.createdAt ?? new Date().toISOString(),
    colors: params.colors,
    semantic: semanticFromRamps(params.colors, params.darkDefault),
    fonts: params.fonts,
    radius: { style: params.radiusStyle, ...params.radius },
    typeScale: { ratio: params.ratio, baseRem: 1 },
    ...tokenGroups({ vibe: params.vibeId, colors: params.colors }, params.motion),
    gradients: buildGradients(params.colors),
  };
}

export function buildFromVibe(name: string, vibe: Vibe, fonts?: Partial<DesignSystem["fonts"]>): DesignSystem {
  const colors = rampsFromVibe(vibe);
  return buildDesignSystem({
    name,
    vibeId: vibe.id,
    colors,
    darkDefault: vibe.darkModeDefault,
    fonts: { ...vibe.fonts, ...fonts },
    radiusStyle: vibe.radius,
    radius: RADIUS_PRESETS[vibe.radius],
    ratio: vibe.typeRatio,
    motion: vibe.motion,
  });
}
