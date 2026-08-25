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
    id: "cyberpunk", label: "Cyberpunk", description: "Neon on near-black. Sharp edges, high voltage.",
    primarySeed: "#ff2d95", accentSeed: "#00e5ff", neutralTintHue: 280,
    darkModeDefault: true, radius: "sharp", typeRatio: 1.333,
    fonts: { heading: "Space Grotesk", body: "IBM Plex Sans", mono: "IBM Plex Mono" },
  },
  {
    id: "brutalist", label: "Brutalist", description: "Raw black & white, one acid accent, zero apology.",
    primarySeed: "#111111", accentSeed: "#dfff4f", neutralTintHue: undefined,
    darkModeDefault: false, radius: "sharp", typeRatio: 1.414,
    fonts: { heading: "Archivo Black", body: "Archivo", mono: "JetBrains Mono" },
  },
  {
    id: "soft-pastel", label: "Soft Pastel", description: "Lavender air. Gentle, friendly, rounded.",
    primarySeed: "#a78bfa", accentSeed: "#5eead4", neutralTintHue: 300,
    darkModeDefault: false, radius: "round", typeRatio: 1.2,
    fonts: { heading: "Quicksand", body: "Nunito Sans", mono: "Fira Code" },
  },
  {
    id: "corporate-clean", label: "Corporate Clean", description: "Trustworthy blue. Ship-to-production safe.",
    primarySeed: "#2563eb", accentSeed: "#0ea5e9", neutralTintHue: 230,
    darkModeDefault: false, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Inter", body: "Inter", mono: "IBM Plex Mono" },
  },
  {
    id: "earthy", label: "Earthy / Organic", description: "Terracotta, sage, cream. Farmers-market warmth.",
    primarySeed: "#c2703d", accentSeed: "#7d9b76", neutralTintHue: 60,
    darkModeDefault: false, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Fraunces", body: "Source Sans 3", mono: "Courier Prime" },
  },
  {
    id: "luxury", label: "Luxury", description: "Charcoal & gold serif. Slow fashion energy.",
    primarySeed: "#d4af37", accentSeed: "#8b6f47", neutralTintHue: 45,
    darkModeDefault: true, radius: "sharp", typeRatio: 1.618,
    fonts: { heading: "Playfair Display", body: "Lato", mono: "Cormorant Garamond" },
  },
  {
    id: "playful", label: "Playful", description: "Bubblegum brights, pill buttons, big grins.",
    primarySeed: "#fb7185", accentSeed: "#38bdf8", neutralTintHue: 350,
    darkModeDefault: false, radius: "pill", typeRatio: 1.333,
    fonts: { heading: "Baloo 2", body: "Fredoka", mono: "Nunito" },
  },
  {
    id: "retro", label: "Retro 70s", description: "Mustard, burnt orange, avocado wood-panel vibes.",
    primarySeed: "#e07a3f", accentSeed: "#946b2d", neutralTintHue: 70,
    darkModeDefault: false, radius: "soft", typeRatio: 1.333,
    fonts: { heading: "DM Serif Display", body: "Karla", mono: "Space Mono" },
  },
  {
    id: "mono-minimal", label: "Mono Minimal", description: "Grayscale + one precise blue. Swiss discipline.",
    primarySeed: "#18181b", accentSeed: "#3b82f6", neutralTintHue: undefined,
    darkModeDefault: false, radius: "soft", typeRatio: 1.25,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  },
  {
    id: "ocean-calm", label: "Ocean Calm", description: "Teal mist. Breathes easy, focus-friendly.",
    primarySeed: "#0ea5a6", accentSeed: "#6366f1", neutralTintHue: 190,
    darkModeDefault: false, radius: "round", typeRatio: 1.25,
    fonts: { heading: "Outfit", body: "Public Sans", mono: "Martian Mono" },
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
