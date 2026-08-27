import { describe, expect, it } from "vitest";
import { hexToOklch } from "./color.ts";
import { getVibe } from "./vibes.ts";
import { customSeedsFromInputs, reducePaletteState, shiftHue } from "./wizard.ts";
import type { PaletteState } from "./wizard.ts";

describe("shiftHue", () => {
  it("shifts a hex color's hue by the given degrees, preserving lightness and chroma", () => {
    const seed = "#3366cc";
    const before = hexToOklch(seed);
    const after = hexToOklch(shiftHue(seed, 45));
    expect(after.l).toBeCloseTo(before.l, 1);
    expect(after.c).toBeCloseTo(before.c, 1);
    const diff = ((after.h - before.h - 45) % 360 + 360) % 360;
    expect(Math.min(diff, 360 - diff)).toBeLessThan(2);
  });
});

describe("customSeedsFromInputs", () => {
  it("uses the given hue when one is provided", () => {
    const result = customSeedsFromInputs(265, "analogous", "pure");
    expect(hexToOklch(result.primarySeed).h).toBeCloseTo(265, 0);
  });

  it("draws a random hue from the injected rng when hue is undefined", () => {
    // rng() = 0.5 -> hue = floor(0.5 * 360) = 180
    const result = customSeedsFromInputs(undefined, "monochrome", "pure", () => 0.5);
    expect(hexToOklch(result.primarySeed).h).toBeCloseTo(180, 0);
  });

  it("derives the accent seed via harmonize with the requested harmony", () => {
    const result = customSeedsFromInputs(100, "complementary", "pure");
    const primaryHue = hexToOklch(result.primarySeed).h;
    const accentHue = hexToOklch(result.accentSeed).h;
    const diff = ((accentHue - primaryHue - 180) % 360 + 360) % 360;
    expect(Math.min(diff, 360 - diff)).toBeLessThan(2);
  });

  it.each([
    ["warm", 60],
    ["cool", 230],
  ] as const)("sets a fixed neutral tint hue for %s", (tint, expectedHue) => {
    const result = customSeedsFromInputs(100, "monochrome", tint);
    expect(result.neutralTintHue).toBe(expectedHue);
  });

  it("sets neutralTintHue to the primary's own hue for 'match'", () => {
    const result = customSeedsFromInputs(100, "monochrome", "match");
    expect(result.neutralTintHue).toBeCloseTo(hexToOklch(result.primarySeed).h, 0);
  });

  it("leaves neutralTintHue undefined for 'pure'", () => {
    const result = customSeedsFromInputs(100, "monochrome", "pure");
    expect(result.neutralTintHue).toBeUndefined();
  });
});

describe("reducePaletteState", () => {
  const vibe = getVibe("tech")!;
  const state: PaletteState = { primarySeed: "#123456", accentSeed: "#654321", neutralTintHue: 200 };

  it("resets to the vibe's original seeds", () => {
    const result = reducePaletteState(state, vibe, { type: "reset" });
    expect(result).toEqual({
      primarySeed: vibe.primarySeed,
      accentSeed: vibe.accentSeed,
      neutralTintHue: vibe.neutralTintHue,
    });
  });

  it("reset is a no-op without a vibe", () => {
    expect(reducePaletteState(state, undefined, { type: "reset" })).toBe(state);
  });

  it("randomize is a no-op without a vibe", () => {
    expect(reducePaletteState(state, undefined, { type: "randomize" })).toBe(state);
  });

  it("randomize is deterministic under an injected rng and calls it exactly 3 times", () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0.5; // midpoint -> zero offset for each (rng()*range - range/2) term
    };
    const result = reducePaletteState(state, vibe, { type: "randomize" }, rng);
    expect(calls).toBe(3);
    // At rng()=0.5, h offset = 0.5*60-30 = 0, c offset = 0.5*0.06-0.03 = 0 -> primary unchanged from vibe seed.
    const base = hexToOklch(vibe.primarySeed);
    expect(hexToOklch(result.primarySeed).h).toBeCloseTo(base.h, 0);
  });

  it("shift rotates both primary and accent by the given degrees", () => {
    const result = reducePaletteState(state, vibe, { type: "shift", degrees: 30 });
    expect(result).toEqual({
      ...state,
      primarySeed: shiftHue(state.primarySeed, 30),
      accentSeed: shiftHue(state.accentSeed, 30),
    });
  });
});
