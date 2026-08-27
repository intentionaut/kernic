import { describe, expect, it } from "vitest";
import { getVibe, RADIUS_PRESETS, VIBES } from "../vibes.ts";
import { LOOKS } from "./looks.ts";
import { DEFAULT_COPY, PREVIEW_COPY } from "./copy.ts";

const HEX = /^#[0-9a-f]{6}$/i;

describe("VIBES", () => {
  it("has exactly 8 entries with unique ids", () => {
    expect(VIBES.length).toBe(8);
    expect(new Set(VIBES.map((v) => v.id)).size).toBe(8);
  });

  it("every vibe has valid seed hexes, a known radius style, and typeRatio > 1", () => {
    for (const vibe of VIBES) {
      expect(vibe.primarySeed).toMatch(HEX);
      expect(vibe.accentSeed).toMatch(HEX);
      expect(Object.keys(RADIUS_PRESETS)).toContain(vibe.radius);
      expect(vibe.typeRatio).toBeGreaterThan(1);
    }
  });

  it("getVibe resolves a known id and returns undefined for an unknown one", () => {
    expect(getVibe("tech")?.id).toBe("tech");
    expect(getVibe("does-not-exist")).toBeUndefined();
  });
});

describe("RADIUS_PRESETS", () => {
  it("has all 4 style keys, each with a valid CSS length or the pill stadium value", () => {
    for (const style of ["sharp", "soft", "round", "pill"] as const) {
      const preset = RADIUS_PRESETS[style];
      for (const key of ["sm", "md", "lg", "xl"] as const) {
        expect(preset[key]).toMatch(/^(\d+(\.\d+)?(rem|px)|9999px)$/);
      }
    }
  });
});

describe("LOOKS", () => {
  it("has exactly 33 entries with unique ids", () => {
    expect(LOOKS.length).toBe(33);
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(33);
  });

  it("every look's vibeId resolves to a real vibe, and every hex is valid", () => {
    for (const look of LOOKS) {
      expect(getVibe(look.vibeId)).toBeDefined();
      expect(look.primarySeed).toMatch(HEX);
      expect(look.accentSeed).toMatch(HEX);
    }
  });

  it("covers all 8 vibe families, not a subset", () => {
    const covered = new Set(LOOKS.map((l) => l.vibeId));
    expect(covered.size).toBe(8);
    for (const vibe of VIBES) {
      expect(covered.has(vibe.id)).toBe(true);
    }
  });
});

describe("PREVIEW_COPY", () => {
  it("has a real (non-default) entry for every vibe id", () => {
    for (const vibe of VIBES) {
      expect(PREVIEW_COPY[vibe.id]).toBeDefined();
      expect(PREVIEW_COPY[vibe.id]).not.toBe(DEFAULT_COPY);
    }
  });

  it("every entry, including the default, has 3 cards and 3 nav links", () => {
    for (const copy of [DEFAULT_COPY, ...Object.values(PREVIEW_COPY)]) {
      expect(copy.cards.length).toBe(3);
      expect(copy.links.length).toBe(3);
      for (const card of copy.cards) {
        expect(card.title.length).toBeGreaterThan(0);
        expect(card.body.length).toBeGreaterThan(0);
      }
    }
  });
});
