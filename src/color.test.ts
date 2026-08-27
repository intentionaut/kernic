import { describe, expect, it, vi } from "vitest";
import {
  buildGradients,
  buildNeutral,
  buildRamp,
  harmonize,
  hexToOklch,
  hexToRgb,
  hslToRgb,
  oklchToHex,
  randomSeed,
  rgbToHex,
} from "./color.ts";
import { RAMP_STOPS } from "./types.ts";
import { VIBES } from "./vibes.ts";

describe("hslToRgb", () => {
  it("produces pure red at h=0, s=1, l=0.5", () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5);
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it("is achromatic (r=g=b=l) when s=0, regardless of hue", () => {
    for (const h of [0, 90, 180, 270]) {
      const [r, g, b] = hslToRgb(h, 0, 0.42);
      expect(r).toBeCloseTo(0.42, 5);
      expect(g).toBeCloseTo(0.42, 5);
      expect(b).toBeCloseTo(0.42, 5);
    }
  });

  it("wraps negative hues the same as their positive equivalent", () => {
    expect(hslToRgb(-10, 0.5, 0.5)).toEqual(hslToRgb(350, 0.5, 0.5));
  });
});

describe("hexToRgb / rgbToHex", () => {
  it("round-trips black, white, and an arbitrary color", () => {
    for (const hex of ["#000000", "#ffffff", "#336699"]) {
      const [r, g, b] = hexToRgb(hex);
      expect(rgbToHex(r, g, b)).toBe(hex);
    }
  });

  it("clamps out-of-range channel values", () => {
    expect(rgbToHex(2, -1, 0.5)).toBe(`#ff00${Math.round(0.5 * 255).toString(16).padStart(2, "0")}`);
  });
});

describe("hexToOklch / oklchToHex round trip", () => {
  it("round-trips primary colors within tolerance", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#808080", "#ffffff", "#000000"]) {
      const back = oklchToHex(hexToOklch(hex));
      const [r1, g1, b1] = hexToRgb(hex).map((v) => Math.round(v * 255));
      const [r2, g2, b2] = hexToRgb(back).map((v) => Math.round(v * 255));
      expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(1);
      expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(1);
      expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(1);
    }
  });
});

describe("oklchToHex gamut clamping", () => {
  it("reduces chroma but preserves hue and lightness for an out-of-gamut color", () => {
    const outOfGamut = { l: 0.9, c: 0.5, h: 30 };
    const clampedHex = oklchToHex(outOfGamut);
    const decoded = hexToOklch(clampedHex);

    expect(decoded.c).toBeLessThan(outOfGamut.c);
    expect(decoded.l).toBeCloseTo(outOfGamut.l, 2);
    expect(decoded.h).toBeCloseTo(outOfGamut.h, 0);
  });

  it("leaves an already in-gamut color's chroma unreduced", () => {
    const inGamut = { l: 0.5, c: 0.02, h: 200 };
    const decoded = hexToOklch(oklchToHex(inGamut));
    expect(decoded.c).toBeCloseTo(inGamut.c, 2);
  });
});

describe("buildRamp", () => {
  it("produces near-zero chroma at every stop for an achromatic (gray) seed", () => {
    const ramp = buildRamp("#808080");
    for (const stop of RAMP_STOPS) {
      expect(hexToOklch(ramp[stop]).c).toBeLessThan(0.01);
    }
  });

  it("has monotonically decreasing decoded lightness from stop 50 to 950, for every vibe's seed hue", () => {
    for (const vibe of VIBES) {
      const ramp = buildRamp(vibe.primarySeed);
      const lightnesses = RAMP_STOPS.map((stop) => hexToOklch(ramp[stop]).l);
      for (let i = 1; i < lightnesses.length; i++) {
        expect(lightnesses[i]).toBeLessThan(lightnesses[i - 1]);
      }
    }
  });

  it("respects a compressed lRange (fun vibe)", () => {
    const fun = VIBES.find((v) => v.id === "fun")!;
    const ramp = buildRamp(fun.primarySeed, { chromaScale: fun.chromaScale, lRange: fun.lRange });
    const [lo, hi] = fun.lRange!;
    expect(hexToOklch(ramp["50"]).l).toBeCloseTo(hi, 2);
    expect(hexToOklch(ramp["950"]).l).toBeCloseTo(lo, 2);
  });
});

describe("buildNeutral", () => {
  it("is fully achromatic with no tint hue", () => {
    const ramp = buildNeutral();
    for (const stop of RAMP_STOPS) {
      expect(hexToOklch(ramp[stop]).c).toBeCloseTo(0, 2);
    }
  });

  it("carries the given hue with nonzero chroma when tinted", () => {
    // Chroma at these stops is deliberately tiny (0.006 to ~0.03, see CHROMA_FACTOR),
    // so hue extracted via atan2(b, a) is quantization-sensitive after an 8-bit hex
    // round trip. A wider tolerance here reflects that, not a looser correctness bar.
    const ramp = buildNeutral(70);
    for (const stop of RAMP_STOPS) {
      const { c, h } = hexToOklch(ramp[stop]);
      expect(c).toBeGreaterThan(0);
      const diff = Math.min(Math.abs(h - 70), 360 - Math.abs(h - 70));
      expect(diff).toBeLessThan(5);
    }
  });
});

describe("harmonize", () => {
  it.each([
    ["analogous", 40],
    ["complementary", 180],
    ["triadic", 120],
  ] as const)("%s shifts hue by %d degrees", (harmony, degrees) => {
    const seed = "#3366cc";
    const seedHue = hexToOklch(seed).h;
    const resultHue = hexToOklch(harmonize(seed, harmony)).h;
    const diff = ((resultHue - seedHue - degrees) % 360 + 360) % 360;
    const wrapped = Math.min(diff, 360 - diff);
    expect(wrapped).toBeLessThan(2);
  });

  it("keeps the same hue for monochrome", () => {
    const seed = "#3366cc";
    const seedHue = hexToOklch(seed).h;
    const resultHue = hexToOklch(harmonize(seed, "monochrome")).h;
    expect(resultHue).toBeCloseTo(seedHue, 0);
  });

  it("wraps hue correctly near the 360/0 boundary", () => {
    // A seed near hue 350 shifted +180 (complementary) should land near 170, not overflow past 360.
    const seed = oklchToHex({ l: 0.6, c: 0.15, h: 350 });
    const resultHue = hexToOklch(harmonize(seed, "complementary")).h;
    expect(resultHue).toBeGreaterThan(150);
    expect(resultHue).toBeLessThan(190);
  });
});

describe("randomSeed", () => {
  it("is deterministic when Math.random is mocked", () => {
    const seq = [0.5, 0.5, 0.5];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => seq[i++ % seq.length]);
    const a = randomSeed();
    i = 0;
    const b = randomSeed();
    expect(a).toBe(b);
    vi.restoreAllMocks();
  });

  it("always returns a valid hex color", () => {
    for (let i = 0; i < 20; i++) {
      expect(randomSeed()).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("buildGradients", () => {
  it("uses the quiet branch for low-chroma primaries", () => {
    const neutral = buildNeutral();
    const primary = buildRamp("#808080"); // near-zero chroma at 600
    const accent = buildRamp("#808080");
    expect(hexToOklch(primary["600"]).c).toBeLessThan(0.11);

    const gradients = buildGradients({ primary, accent, neutral });
    expect(gradients.mesh).toContain("radial-gradient");
    expect(gradients.primary).toContain(accent["400"]);
    expect(gradients.text).toContain(primary["400"]);
  });

  it("uses the bold branch for high-chroma primaries", () => {
    const neutral = buildNeutral();
    const primary = buildRamp("#ff1493"); // saturated seed, chroma at 600 should exceed 0.11
    const accent = buildRamp("#00cfff");
    expect(hexToOklch(primary["600"]).c).toBeGreaterThanOrEqual(0.11);

    const gradients = buildGradients({ primary, accent, neutral });
    expect(gradients.primary).toContain(primary["800"]);
    expect(gradients.mesh.split(", ").length).toBeGreaterThanOrEqual(4);
  });
});
