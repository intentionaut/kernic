export type Ramp = Record<string, string>; // "50".."950" -> hex

export interface ColorRamps {
  primary: Ramp;
  accent: Ramp;
  neutral: Ramp;
}

/** References a stop on a ramp, e.g. { ramp: "primary", stop: "500" } */
export interface SemanticColor {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export interface Fonts {
  heading: string;
  body: string;
  mono: string;
}

export interface DesignSystem {
  /** Token format version — premium/cloud features extend this schema without breaking older files. */
  schemaVersion: 1;
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
  /** Preconfigured gradient tokens (CSS background values). Optional; additive to schema v1. */
  gradients?: Record<string, string>;
  /** Reserved for premium extensions (motion, shadows, depth, rhythm). Free CLI preserves unknown keys on read/write. */
  extensions?: Record<string, unknown>;
}

export const RAMP_STOPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
