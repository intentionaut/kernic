import { buildNeutral, buildRamp } from "./color.ts";
import type { DesignSystem, Ramp } from "./types.ts";
import { RADIUS_PRESETS, type Vibe } from "./vibes.ts";

export function rampsFromVibe(vibe: Vibe): { primary: Ramp; accent: Ramp; neutral: Ramp } {
  return {
    primary: buildRamp(vibe.primarySeed),
    accent: buildRamp(vibe.accentSeed),
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

export function buildFromVibe(name: string, vibe: Vibe, fonts?: Partial<DesignSystem["fonts"]>): DesignSystem {
  const colors = rampsFromVibe(vibe);
  const radius = RADIUS_PRESETS[vibe.radius];
  return {
    name,
    vibe: vibe.id,
    createdAt: new Date().toISOString(),
    colors,
    semantic: semanticFromRamps(colors, vibe.darkModeDefault),
    fonts: { ...vibe.fonts, ...fonts },
    radius: { style: vibe.radius, ...radius },
    typeScale: { ratio: vibe.typeRatio, baseRem: 1 },
  };
}
