import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromVibe, rampsFromVibe, semanticFromRamps } from "./build.ts";
import { buildNeutral, buildRamp } from "./color.ts";
import { getVibe, VIBES } from "./vibes.ts";

describe("rampsFromVibe", () => {
  it("matches calling buildRamp/buildNeutral directly, for a vibe with chromaScale/lRange", () => {
    const fun = getVibe("fun")!;
    const result = rampsFromVibe(fun);
    expect(result.primary).toEqual(buildRamp(fun.primarySeed, { chromaScale: fun.chromaScale, lRange: fun.lRange }));
    expect(result.accent).toEqual(buildRamp(fun.accentSeed, { chromaScale: fun.chromaScale, lRange: fun.lRange }));
    expect(result.neutral).toEqual(buildNeutral(fun.neutralTintHue));
  });

  it("matches calling buildRamp/buildNeutral directly, for a vibe without chromaScale/lRange", () => {
    const tech = getVibe("tech")!;
    const result = rampsFromVibe(tech);
    expect(result.primary).toEqual(buildRamp(tech.primarySeed, { chromaScale: undefined, lRange: undefined }));
    expect(result.neutral).toEqual(buildNeutral(tech.neutralTintHue));
  });
});

describe("semanticFromRamps", () => {
  const colors = rampsFromVibe(getVibe("corporate")!);

  it("uses primary 500 as the ring color when darkDefault is true", () => {
    const semantic = semanticFromRamps(colors, true);
    expect(semantic.ring).toBe(colors.primary["500"]);
  });

  it("uses primary 600 as the ring color when darkDefault is false", () => {
    const semantic = semanticFromRamps(colors, false);
    expect(semantic.ring).toBe(colors.primary["600"]);
  });

  it("maps the remaining semantic keys to the documented neutral stops", () => {
    const semantic = semanticFromRamps(colors, false);
    expect(semantic.background).toEqual({ light: colors.neutral["50"], dark: colors.neutral["950"] });
    expect(semantic.surface).toEqual({ light: colors.neutral["100"], dark: colors.neutral["900"] });
    expect(semantic.text).toEqual({ light: colors.neutral["950"], dark: colors.neutral["50"] });
    expect(semantic.mutedText).toEqual({ light: colors.neutral["600"], dark: colors.neutral["400"] });
    expect(semantic.border).toEqual({ light: colors.neutral["200"], dark: colors.neutral["800"] });
  });
});

describe("buildFromVibe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(VIBES)("produces a stable snapshot for the $id vibe", (vibe) => {
    const ds = buildFromVibe(`test-${vibe.id}`, vibe);
    expect(ds).toMatchSnapshot();
  });

  it("always sets schemaVersion to 1 and includes gradients", () => {
    const ds = buildFromVibe("test", getVibe("tech")!);
    expect(ds.schemaVersion).toBe(1);
    expect(ds.gradients).toBeDefined();
    expect(Object.keys(ds.gradients!).length).toBeGreaterThan(0);
  });

  it("overrides only the given font fields, inheriting the rest from the vibe", () => {
    const vibe = getVibe("tech")!;
    const ds = buildFromVibe("test", vibe, { mono: "Custom Mono" });
    expect(ds.fonts.mono).toBe("Custom Mono");
    expect(ds.fonts.heading).toBe(vibe.fonts.heading);
    expect(ds.fonts.body).toBe(vibe.fonts.body);
  });
});
