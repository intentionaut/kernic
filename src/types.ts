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
}

export const RAMP_STOPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
