import type { DesignSystem } from "./types.ts";

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
}

export const VIBES: Vibe[] = [
  {
    id: "retro", label: "Retro", description: "70s warmth, 80s neon. Analog soul.",
    primarySeed: "#e07a3f", accentSeed: "#946b2d", neutralTintHue: 70,
    darkModeDefault: false, radius: "soft", typeRatio: 1.333,
    fonts: { heading: "DM Serif Display", body: "Karla", mono: "Space Mono" },
  },
  {
    id: "tech", label: "Tech", description: "Electric, precise, built at night.",
    primarySeed: "#22d3ee", accentSeed: "#8b5cf6", neutralTintHue: 200,
    darkModeDefault: true, radius: "sharp", typeRatio: 1.25,
    fonts: { heading: "Space Grotesk", body: "Inter", mono: "JetBrains Mono" },
  },
  {
    id: "corporate", label: "Corporate", description: "Trustworthy, crisp, ship-safe.",
    primarySeed: "#2563eb", accentSeed: "#0ea5e9", neutralTintHue: 230,
    darkModeDefault: false, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Inter", body: "Inter", mono: "IBM Plex Mono" },
  },
  {
    id: "neon", label: "Neon", description: "Gradient-fueled fintech polish. Stripe energy.",
    primarySeed: "#635bff", accentSeed: "#00d4ff", neutralTintHue: 250,
    darkModeDefault: true, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  },
  {
    id: "minimal", label: "Minimal", description: "Restraint as a design decision.",
    primarySeed: "#18181b", accentSeed: "#a1a1aa", neutralTintHue: undefined,
    darkModeDefault: false, radius: "soft", typeRatio: 1.125,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  },
  {
    id: "soft-pastel", label: "Soft Pastel", description: "Gentle, friendly, rounded.",
    primarySeed: "#b8a7f5", accentSeed: "#7dd3fc", neutralTintHue: 300,
    darkModeDefault: false, radius: "round", typeRatio: 1.2,
    fonts: { heading: "Quicksand", body: "Nunito Sans", mono: "Fira Code" },
  },
  {
    id: "luxury", label: "Luxury", description: "Charcoal, gold serif, slow confidence.",
    primarySeed: "#d4af37", accentSeed: "#8b6f47", neutralTintHue: 45,
    darkModeDefault: true, radius: "sharp", typeRatio: 1.618,
    fonts: { heading: "Playfair Display", body: "Lato", mono: "Cormorant Garamond" },
  },
  {
    id: "earthy", label: "Earthy / Organic", description: "Terracotta, sage, cream.",
    primarySeed: "#c2703d", accentSeed: "#7d9b76", neutralTintHue: 60,
    darkModeDefault: false, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Fraunces", body: "Source Sans 3", mono: "Courier Prime" },
  },
];

export const RADIUS_PRESETS: Record<RadiusStyle, { sm: string; md: string; lg: string; xl: string }> = {
  sharp: { sm: "0rem", md: "0rem", lg: "0.125rem", xl: "0.25rem" },
  soft: { sm: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem" },
  round: { sm: "0.375rem", md: "0.625rem", lg: "1rem", xl: "1.5rem" },
  pill: { sm: "0.5rem", md: "9999px", lg: "9999px", xl: "9999px" },
};

export function getVibe(id: string): Vibe | undefined {
  return VIBES.find((v) => v.id === id);
}
