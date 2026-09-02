import type { DesignSystem, Ramp } from "./types.ts";

/**
 * The semantic tokens, in the order every export lists them. One list, so the
 * CSS, Tailwind, DTCG, DESIGN.md and shadcn writers cannot disagree about which
 * roles exist or what they are called.
 */
export const SEMANTIC_KEYS = ["background", "surface", "text", "mutedText", "border", "ring"] as const;
export type SemanticKey = (typeof SEMANTIC_KEYS)[number];

/** The CSS custom property name each role is published under. */
export const SEMANTIC_CSS: Record<SemanticKey, string> = {
  background: "background",
  surface: "surface",
  text: "text",
  mutedText: "muted-text",
  border: "border",
  ring: "ring",
};

export interface SemanticEntry {
  key: SemanticKey;
  /** Name without the leading `--`. */
  css: string;
  light: string;
  dark: string;
}

/** Light and dark hex for every role. `ring` is a single value and is repeated for both. */
export function semanticEntries(ds: DesignSystem): SemanticEntry[] {
  return SEMANTIC_KEYS.map((key) => {
    const v = ds.semantic[key];
    const light = typeof v === "string" ? v : v.light;
    const dark = typeof v === "string" ? v : v.dark;
    return { key, css: SEMANTIC_CSS[key], light, dark };
  });
}

export interface RampStop {
  ramp: string;
  stop: string;
}

/**
 * The ramp stop a hex value came from, if any. Semantic tokens are chosen from
 * the ramps, so this lets DTCG and DESIGN.md publish them as references to the
 * stop rather than as a second copy of the same hex.
 */
export function findRampStop(ds: DesignSystem, hex: string): RampStop | null {
  const target = hex.toLowerCase();
  for (const [ramp, stops] of Object.entries(ds.colors) as [string, Ramp][]) {
    for (const [stop, value] of Object.entries(stops)) {
      if (value.toLowerCase() === target) return { ramp, stop };
    }
  }
  return null;
}
