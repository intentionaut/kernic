import { describe, expect, it } from "vitest";
import { exportCss, exportFonts, exportTailwind } from "./export.ts";
import { FIXTURE_EDGE_DS, FIXTURE_VIBE_DS } from "./test/fixtures.ts";
import { RAMP_STOPS } from "./types.ts";

describe("exportCss", () => {
  it("matches a stable snapshot for the vibe fixture", () => {
    expect(exportCss(FIXTURE_VIBE_DS)).toMatchSnapshot();
  });

  it("emits exactly RAMP_STOPS.length * 3 color variable lines (3 ramps)", () => {
    const out = exportCss(FIXTURE_VIBE_DS);
    const lines = out.split("\n").filter((l) => /^\s*--color-(primary|accent|neutral)-\d+:/.test(l));
    expect(lines.length).toBe(RAMP_STOPS.length * 3);
  });

  it("omits the gradient section when gradients is undefined", () => {
    expect(exportCss(FIXTURE_EDGE_DS)).not.toContain("/* Gradients */");
  });

  it("omits the gradient section when gradients is an empty object", () => {
    const ds = { ...FIXTURE_EDGE_DS, gradients: {} };
    expect(exportCss(ds)).not.toContain("/* Gradients */");
  });

  it("includes the gradient section when gradients are present", () => {
    expect(exportCss(FIXTURE_VIBE_DS)).toContain("/* Gradients */");
  });
});

describe("exportTailwind", () => {
  it("matches a stable snapshot for the vibe fixture", () => {
    expect(exportTailwind(FIXTURE_VIBE_DS)).toMatchSnapshot();
  });

  it("emits no --background-image-* lines when gradients is an empty object (different guard than exportCss, same net output)", () => {
    const ds = { ...FIXTURE_EDGE_DS, gradients: {} };
    expect(exportTailwind(ds)).not.toMatch(/--background-image-/);
  });

  it("emits no --background-image-* lines when gradients is undefined", () => {
    expect(exportTailwind(FIXTURE_EDGE_DS)).not.toMatch(/--background-image-/);
  });

  it("emits --background-image-* lines when gradients are present", () => {
    expect(exportTailwind(FIXTURE_VIBE_DS)).toMatch(/--background-image-primary:/);
  });
});

describe("exportFonts", () => {
  it("matches a stable snapshot for the vibe fixture", () => {
    expect(exportFonts(FIXTURE_VIBE_DS)).toMatchSnapshot();
  });

  it("dedupes <link> tags when heading and body share the same family", () => {
    // FIXTURE_EDGE_DS: heading === body === "DM Serif Display", mono is distinct.
    const out = exportFonts(FIXTURE_EDGE_DS);
    const linkTags = out.match(/<link href="[^"]+" rel="stylesheet">/g) ?? [];
    expect(linkTags.length).toBe(2); // one for the shared heading/body family, one for mono
  });

  it("emits 3 distinct <link> tags when all three fonts differ", () => {
    const out = exportFonts(FIXTURE_VIBE_DS);
    const linkTags = out.match(/<link href="[^"]+" rel="stylesheet">/g) ?? [];
    expect(linkTags.length).toBe(3);
  });
});
