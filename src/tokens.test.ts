import { describe, expect, it } from "vitest";
import {
  MOTION_PRESET_IDS,
  buildBreakpoints,
  buildContainers,
  buildMotion,
  buildShadows,
  buildSpacing,
  buildTypography,
  easeCss,
  hexAlpha,
  migrateSystem,
  shadowCss,
  tokenGroups,
} from "./tokens.ts";
import { FIXTURE_V1_FILE, FIXTURE_VIBE_DS } from "./test/fixtures.ts";
import { SHADOW_LEVELS, TYPE_STEPS } from "./types.ts";
import { VIBES } from "./vibes.ts";

describe("buildSpacing", () => {
  it("names steps with a dash for the decimal point and carries the Tailwind unit", () => {
    const s = buildSpacing();
    expect(s.unit).toBe("0.25rem");
    expect(s.scale["0-5"]).toBe("0.5rem");
    expect(s.scale["16"]).toBe("16rem");
    expect(Object.keys(s.scale)).toHaveLength(10);
  });
});

describe("buildShadows", () => {
  it("tints every layer from the darkest neutral and gives dark mode a denser set", () => {
    const shadows = buildShadows(FIXTURE_VIBE_DS.colors.neutral);
    const tint = FIXTURE_VIBE_DS.colors.neutral["950"];
    for (const level of SHADOW_LEVELS) {
      for (const layer of [...shadows[level].light, ...shadows[level].dark]) expect(layer.color).toBe(tint);
      expect(shadows[level].dark[0].alpha).toBeGreaterThan(shadows[level].light[0].alpha);
    }
    expect(shadows.xs.light).toHaveLength(1);
    expect(shadows.xl.light).toHaveLength(2);
  });

  it("is deterministic on its input", () => {
    expect(buildShadows(FIXTURE_VIBE_DS.colors.neutral)).toEqual(buildShadows(FIXTURE_VIBE_DS.colors.neutral));
  });
});

describe("hexAlpha and shadowCss", () => {
  it("appends a two-digit alpha and renders one box-shadow value per layer", () => {
    expect(hexAlpha("#0B1220", 0.5)).toBe("#0b122080");
    expect(hexAlpha("#0b1220", 1)).toBe("#0b1220ff");
    expect(hexAlpha("#0b1220", 0)).toBe("#0b122000");
    const css = shadowCss([
      { x: "0px", y: "1px", blur: "2px", spread: "0px", color: "#0b1220", alpha: 0.1 },
      { x: "0px", y: "2px", blur: "4px", spread: "-2px", color: "#0b1220", alpha: 0.1 },
    ]);
    expect(css).toBe("0px 1px 2px 0px #0b12201a, 0px 2px 4px -2px #0b12201a");
  });
});

describe("buildMotion", () => {
  it("has a preset for every vibe, with durations that order fast < base < slow", () => {
    for (const vibe of VIBES) expect(MOTION_PRESET_IDS).toContain(vibe.motion);
    for (const id of MOTION_PRESET_IDS) {
      const m = buildMotion(id);
      const ms = (s: string) => Number.parseFloat(s);
      expect(ms(m.duration.fast)).toBeLessThan(ms(m.duration.base));
      expect(ms(m.duration.base)).toBeLessThan(ms(m.duration.slow));
    }
  });

  it("uses no easing that overshoots", () => {
    const m = buildMotion("lively");
    for (const curve of Object.values(m.ease)) {
      for (const n of curve) expect(n).toBeGreaterThanOrEqual(0);
      for (const n of curve) expect(n).toBeLessThanOrEqual(1);
    }
    expect(easeCss(m.ease.out)).toBe("cubic-bezier(0.2, 0, 0, 1)");
  });
});

describe("buildTypography, buildBreakpoints, buildContainers", () => {
  it("covers every type step, tightens leading as sizes grow, and matches Tailwind's breakpoints", () => {
    const t = buildTypography();
    expect(Object.keys(t.leading)).toEqual([...TYPE_STEPS]);
    expect(t.leading.xs).toBeGreaterThan(t.leading["5xl"]);
    expect(t.weights.bold).toBe(700);
    expect(buildBreakpoints().md).toBe("48rem");
    expect(buildContainers().measure).toBe("65ch");
  });
});

describe("migrateSystem", () => {
  it("brings a version-1 file to version 2 by deriving the six token groups", () => {
    const ds = migrateSystem(FIXTURE_V1_FILE);
    expect(ds.schemaVersion).toBe(2);
    expect(ds.spacing).toEqual(buildSpacing());
    expect(ds.shadows).toEqual(buildShadows(FIXTURE_V1_FILE.colors.neutral));
    expect(ds.motion.preset).toBe("brisk");
    expect(ds.name).toBe(FIXTURE_V1_FILE.name);
    expect(ds.gradients).toBeUndefined();
  });

  it("takes the motion preset from the vibe when the file names one", () => {
    const ds = migrateSystem({ ...FIXTURE_V1_FILE, vibe: "soft-pastel" });
    expect(ds.motion.preset).toBe("calm");
  });

  it("passes a version-2 system through untouched", () => {
    expect(migrateSystem(FIXTURE_VIBE_DS)).toBe(FIXTURE_VIBE_DS);
  });

  it("keeps keys it does not know", () => {
    const ds = migrateSystem({ ...FIXTURE_V1_FILE, extensions: { "com.example": { keep: true } } });
    expect(ds.extensions).toEqual({ "com.example": { keep: true } });
  });

  it("produces the same groups a fresh build would", () => {
    const groups = tokenGroups({ vibe: "tech", colors: FIXTURE_VIBE_DS.colors });
    expect(FIXTURE_VIBE_DS.typography).toEqual(groups.typography);
    expect(FIXTURE_VIBE_DS.shadows).toEqual(groups.shadows);
    expect(FIXTURE_VIBE_DS.motion).toEqual(groups.motion);
  });
});
