import { describe, expect, it } from "vitest";
import { contrastRatio } from "./color.ts";
import { SHADCN_SCHEMA, destructiveFor, isKernicShadcn, onColor, shadcnRegistryItem, shadcnVars } from "./shadcn.ts";
import { FIXTURE_EDGE_DS, FIXTURE_VIBE_DS } from "./test/fixtures.ts";

const OKLCH = /^oklch\(\d(\.\d+)? \d(\.\d+)? \d+(\.\d+)?\)$/;

describe("shadcnVars", () => {
  it("writes every colour as an oklch() string, names without the leading dashes", () => {
    const { theme, light, dark } = shadcnVars(FIXTURE_VIBE_DS);
    for (const bucket of [light, dark]) {
      for (const [name, value] of Object.entries(bucket)) {
        expect(name.startsWith("--")).toBe(false);
        if (name === "radius" || name.startsWith("shadow-")) continue;
        expect(value, name).toMatch(OKLCH);
      }
    }
    expect(theme["color-primary-500"]).toMatch(OKLCH);
    expect(light["shadow-md"]).toContain("px");
    expect(theme["ease-out"]).toMatch(/^cubic-bezier\(/);
    expect(theme["duration-base"]).toMatch(/ms$/);
  });

  it("maps kernic roles onto shadcn's names", () => {
    const { light, dark } = shadcnVars(FIXTURE_VIBE_DS);
    const roles = [
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "primary",
      "primary-foreground",
      "secondary",
      "muted",
      "muted-foreground",
      "accent",
      "accent-foreground",
      "destructive",
      "border",
      "input",
      "ring",
      "chart-1",
      "chart-5",
      "sidebar",
      "sidebar-ring",
      "radius",
    ];
    for (const role of roles) {
      expect(light, role).toHaveProperty(role);
      expect(dark, role).toHaveProperty(role);
    }
  });

  it("keeps shadcn's accent role neutral and publishes the brand accent ramp under the theme", () => {
    const { theme, light } = shadcnVars(FIXTURE_VIBE_DS);
    expect(light.accent).toBe(theme["color-neutral-200"]);
    expect(theme["color-accent-500"]).toBeDefined();
  });

  it("carries the fonts and the radius", () => {
    const { theme, light } = shadcnVars(FIXTURE_VIBE_DS);
    expect(theme["font-sans"]).toContain(FIXTURE_VIBE_DS.fonts.body);
    expect(theme["font-heading"]).toContain(FIXTURE_VIBE_DS.fonts.heading);
    expect(theme["font-mono"]).toContain(FIXTURE_VIBE_DS.fonts.mono);
    expect(light.radius).toBe(FIXTURE_VIBE_DS.radius.md);
  });
});

describe("onColor", () => {
  it("picks whichever candidate contrasts more with the background", () => {
    expect(onColor("#000000", "#ffffff", "#111111")).toBe("#ffffff");
    expect(onColor("#ffffff", "#ffffff", "#111111")).toBe("#111111");
  });

  it("gives primary buttons a readable label on both fixtures", () => {
    for (const ds of [FIXTURE_VIBE_DS, FIXTURE_EDGE_DS]) {
      const bg = ds.colors.primary["600"];
      const fg = onColor(bg, ds.colors.neutral["50"], ds.colors.neutral["950"]);
      expect(contrastRatio(bg, fg)).toBeGreaterThan(3);
    }
  });
});

describe("destructiveFor", () => {
  it("returns a red at the primary's lightness", () => {
    const red = destructiveFor(FIXTURE_VIBE_DS.colors.primary["600"]);
    expect(red).toMatch(/^#[0-9a-f]{6}$/);
    const [r, g, b] = [red.slice(1, 3), red.slice(3, 5), red.slice(5, 7)].map((h) => parseInt(h, 16));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });
});

describe("shadcnRegistryItem", () => {
  it("is a registry:style item against the published schema", () => {
    const item = JSON.parse(shadcnRegistryItem(FIXTURE_VIBE_DS));
    expect(item.$schema).toBe(SHADCN_SCHEMA);
    expect(item.type).toBe("registry:style");
    expect(item.name).toBe(FIXTURE_VIBE_DS.name);
    expect(item.cssVars.theme).toBeDefined();
    expect(item.cssVars.light).toBeDefined();
    expect(item.cssVars.dark).toBeDefined();
  });

  it("stamps itself so a later run knows it may replace the file", () => {
    const text = shadcnRegistryItem(FIXTURE_VIBE_DS);
    expect(isKernicShadcn(text)).toBe(true);
    expect(isKernicShadcn('{"name":"x","type":"registry:style"}')).toBe(false);
    expect(isKernicShadcn("{ not json")).toBe(false);
    expect(isKernicShadcn("null")).toBe(false);
  });

  it("names the fonts to load in docs", () => {
    const item = JSON.parse(shadcnRegistryItem(FIXTURE_VIBE_DS));
    expect(item.docs).toContain(FIXTURE_VIBE_DS.fonts.heading);
  });
});
