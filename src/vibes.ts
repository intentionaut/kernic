import type { DesignSystem, MotionPreset } from "./types.ts";

export type RadiusStyle = DesignSystem["radius"]["style"];

export interface Vibe {
  id: string;
  label: string;
  description: string;
  primarySeed: string;
  accentSeed: string;
  neutralTintHue?: number; // undefined = pure gray
  darkModeDefault: boolean;
  radius: RadiusStyle;
  typeRatio: number;
  fonts: { heading: string; body: string; mono: string };
  /** How transitions feel: calm, brisk or lively. Durations only; no easing overshoots. */
  motion: MotionPreset;
  /** Boost chroma beyond the seed's own saturation (gamut-clamped). */
  chromaScale?: number;
  /** Tight lightness window — fewer perceptually distinct colors, more solid blocks. */
  lRange?: [number, number];
}

export const VIBES: Vibe[] = [
  {
    id: "retro", label: "Retro", description: "70s warmth, 80s neon. Analog soul.",
    motion: "lively",
    primarySeed: "#e07a3f", accentSeed: "#946b2d", neutralTintHue: 70,
    darkModeDefault: false, radius: "soft", typeRatio: 1.333,
    fonts: { heading: "DM Serif Display", body: "Karla", mono: "Space Mono" },
  },
  {
    id: "tech", label: "Tech", description: "Electric, precise, built at night.",
    motion: "brisk",
    primarySeed: "#22d3ee", accentSeed: "#8b5cf6", neutralTintHue: 200,
    darkModeDefault: true, radius: "sharp", typeRatio: 1.25,
    fonts: { heading: "Space Grotesk", body: "Inter", mono: "JetBrains Mono" },
  },
  {
    id: "corporate", label: "Corporate", description: "Trustworthy, crisp, ship-safe.",
    motion: "brisk",
    primarySeed: "#2563eb", accentSeed: "#0ea5e9", neutralTintHue: 230,
    darkModeDefault: false, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Inter", body: "Inter", mono: "IBM Plex Mono" },
  },
  {
    id: "neon", label: "Neon", description: "Gradient-fueled fintech polish. Stripe energy.",
    motion: "lively",
    primarySeed: "#635bff", accentSeed: "#00d4ff", neutralTintHue: 250,
    darkModeDefault: true, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  },
  {
    id: "minimal", label: "Minimal", description: "Restraint as a design decision.",
    motion: "brisk",
    primarySeed: "#18181b", accentSeed: "#a1a1aa", neutralTintHue: undefined,
    darkModeDefault: false, radius: "soft", typeRatio: 1.125,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  },
  {
    id: "soft-pastel", label: "Soft Pastel", description: "Gentle, friendly, rounded.",
    motion: "calm",
    primarySeed: "#b8a7f5", accentSeed: "#7dd3fc", neutralTintHue: 300,
    darkModeDefault: false, radius: "round", typeRatio: 1.2,
    fonts: { heading: "Quicksand", body: "Nunito Sans", mono: "Fira Code" },
  },
  {
    id: "fun", label: "Fun", description: "Crayon-bright solids. Few colors, all joy.",
    motion: "lively",
    primarySeed: "#ff1493", accentSeed: "#00cfff", neutralTintHue: 310,
    darkModeDefault: false, radius: "pill", typeRatio: 1.333,
    chromaScale: 1.25, lRange: [0.46, 0.94],
    fonts: { heading: "Baloo 2", body: "Fredoka", mono: "Nunito" },
  },
  {
    id: "earthy", label: "Earthy / Organic", description: "Terracotta, sage, cream.",
    motion: "calm",
    primarySeed: "#c2703d", accentSeed: "#7d9b76", neutralTintHue: 60,
    darkModeDefault: false, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Fraunces", body: "Source Sans 3", mono: "Courier Prime" },
  },
];

export const RADIUS_PRESETS: Record<RadiusStyle, { sm: string; md: string; lg: string; xl: string }> = {
  sharp: { sm: "0rem", md: "0rem", lg: "0.125rem", xl: "0.25rem" },
  soft: { sm: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem" },
  round: { sm: "0.375rem", md: "0.625rem", lg: "1rem", xl: "1.5rem" },
  // pill: controls (sm/md) go full stadium; containers (lg/xl) stay bounded
  pill: { sm: "9999px", md: "9999px", lg: "1.5rem", xl: "2rem" },
};

export function getVibe(id: string): Vibe | undefined {
  return VIBES.find((v) => v.id === id);
}
