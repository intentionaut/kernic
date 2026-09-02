import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DESIGN_MD_HEADINGS,
  DESIGN_MD_SPEC,
  OWNERSHIP_MARK,
  agentRule,
  agentRuleLines,
  designBrief,
  designFrontmatter,
  dtcgDimension,
  dtcgTokens,
} from "./context.ts";
import { FIXED_CREATED_AT, FIXTURE_EDGE_DS, FIXTURE_VIBE_DS } from "./test/fixtures.ts";

// writeContext lives in export.ts (next to the other renderers, so one module
// owns the format -> filename map). Its tests live in export.test.ts.

describe("designBrief", () => {
  it("opens with YAML front matter and carries the ownership mark inside the first 512 bytes", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    expect(brief.startsWith("---\n")).toBe(true);
    expect(brief.indexOf("\n---\n", 4)).toBeGreaterThan(0);
    expect(brief.slice(0, 512)).toContain(OWNERSHIP_MARK);
  });

  it("has the spec's section headings, in the spec's order", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    const positions = DESIGN_MD_HEADINGS.map((h) => brief.indexOf(`\n${h}\n`));
    for (const at of positions) expect(at).toBeGreaterThan(0);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("puts no heading above the front matter and no unknown h2 below it", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    const h2s = brief.split("\n").filter((l) => l.startsWith("## "));
    expect(h2s).toEqual([...DESIGN_MD_HEADINGS]);
  });

  it("uses the fixture's frozen created date", () => {
    expect(designBrief(FIXTURE_VIBE_DS)).toContain(FIXED_CREATED_AT.slice(0, 10));
  });

  it("names the spec version it was written to", () => {
    expect(designBrief(FIXTURE_VIBE_DS)).toContain(`version: ${DESIGN_MD_SPEC}`);
  });

  it("builds ramp-table swatch URLs without the leading # on the hex", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    const hex = FIXTURE_VIBE_DS.colors.primary["500"];
    expect(brief).toContain(`https://placehold.co/24x12/${hex.slice(1)}/${hex.slice(1)}`);
    expect(brief).not.toContain(`placehold.co/24x12/${hex}/`);
  });

  it("includes a Gradients subsection only when the design system has gradients", () => {
    expect(designBrief(FIXTURE_VIBE_DS)).toContain("### Gradients");
    expect(designBrief(FIXTURE_EDGE_DS)).not.toContain("### Gradients");
  });

  it("describes shadows, motion, breakpoints and containers in the prose", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    expect(brief).toContain("### Spacing");
    expect(brief).toContain("### Breakpoints and containers");
    expect(brief).toContain("### Motion");
    expect(brief).toContain("`--shadow-md`");
    expect(brief).toContain(FIXTURE_VIBE_DS.motion.duration.base);
    expect(brief).toContain("prefers-reduced-motion");
  });

  it("states the three families in the Do list and forbids others in the Don't list", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    expect(brief).toContain(`headings in "${FIXTURE_VIBE_DS.fonts.heading}"`);
    expect(brief).toContain("### Do\n");
    expect(brief).toContain("### Don't\n");
    expect(brief).toContain("- Invent raw hex");
  });
});

describe("designFrontmatter", () => {
  it("publishes every ramp stop as a flat colour and every role as a reference to its stop", () => {
    const fm = designFrontmatter(FIXTURE_VIBE_DS) as any;
    expect(fm.colors["primary-500"]).toBe(FIXTURE_VIBE_DS.colors.primary["500"]);
    expect(fm.colors.background).toBe("{colors.neutral-50}");
    expect(fm.colors["background-dark"]).toBe("{colors.neutral-950}");
    expect(fm.colors.primary).toBe("{colors.primary-600}");
    expect(fm.colors.ring).toMatch(/^\{colors\.primary-\d+\}$/);
    expect(fm.colors["ring-dark"]).toBeUndefined();
  });

  it("maps typography roles onto the type scale with the system's families", () => {
    const fm = designFrontmatter(FIXTURE_VIBE_DS) as any;
    expect(fm.typography.body.fontFamily).toBe(FIXTURE_VIBE_DS.fonts.body);
    expect(fm.typography.body.fontSize).toBe("1.000rem");
    expect(fm.typography.display.fontFamily).toBe(FIXTURE_VIBE_DS.fonts.heading);
    expect(fm.typography.code.fontFamily).toBe(FIXTURE_VIBE_DS.fonts.mono);
    expect(fm.typography.display.fontWeight).toBe(700);
  });

  it("declares components as intentionally omitted, so the linter stays quiet about it", () => {
    const fm = designFrontmatter(FIXTURE_VIBE_DS) as any;
    expect(fm.omitted[0].section).toBe("components");
    expect(fm.components).toBeUndefined();
  });

  it("carries rounded with a DEFAULT and full, and spacing with a unit and base", () => {
    const fm = designFrontmatter(FIXTURE_VIBE_DS) as any;
    expect(fm.rounded.DEFAULT).toBe(FIXTURE_VIBE_DS.radius.md);
    expect(fm.rounded.full).toBe("9999px");
    expect(fm.spacing.unit).toBe("0.25rem");
    expect(fm.spacing.base).toBe("1rem");
    expect(fm.spacing["0-5"]).toBe("0.5rem");
  });

  it("takes role weights, leading and tracking from the system's typography tokens", () => {
    const fm = designFrontmatter(FIXTURE_VIBE_DS) as any;
    expect(fm.typography.display.fontWeight).toBe(FIXTURE_VIBE_DS.typography.weights.bold);
    expect(fm.typography.display.lineHeight).toBe(FIXTURE_VIBE_DS.typography.leading["5xl"]);
    expect(fm.typography.label.letterSpacing).toBe(FIXTURE_VIBE_DS.typography.tracking.wide);
  });
});

describe("DESIGN.md conforms to Google's spec", () => {
  const linter = fileURLToPath(new URL("../node_modules/@google/design.md/dist/index.js", import.meta.url));
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-designmd-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function lint(file: string): { summary: { errors: number; warnings: number } } {
    let out: string;
    try {
      out = execFileSync(process.execPath, [linter, "lint", file], { encoding: "utf8" });
    } catch (err: any) {
      out = String(err.stdout ?? "");
      if (!out.trim()) throw err;
    }
    return JSON.parse(out);
  }

  it("ships the linter this test depends on", () => {
    // A missing dev dependency must fail here, in one place, rather than skip.
    expect(existsSync(linter)).toBe(true);
  });

  it.each([
    ["vibe fixture", FIXTURE_VIBE_DS],
    ["edge fixture (custom vibe, gray neutral, no gradients)", FIXTURE_EDGE_DS],
  ])("lints clean for the %s", async (_label, ds) => {
    const file = join(dir, `${ds.name}.md`);
    await writeFile(file, designBrief(ds), "utf8");
    const result = lint(file);
    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
  });
});

describe("dtcgTokens (Format Module 2025.10)", () => {
  it("writes colours as OKLCH objects with a hex fallback", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_VIBE_DS));
    const token = tokens.color.primary["500"];
    expect(token.$type).toBe("color");
    expect(token.$value.colorSpace).toBe("oklch");
    expect(token.$value.components).toHaveLength(3);
    expect(token.$value.hex).toBe(FIXTURE_VIBE_DS.colors.primary["500"]);
  });

  it("marks hue as none on an achromatic neutral, as the spec allows", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_EDGE_DS));
    expect(tokens.color.neutral["500"].$value.components[2]).toBe("none");
  });

  it("publishes semantic roles as references to the ramp stop they came from", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_VIBE_DS));
    expect(tokens.color.semantic.light["muted-text"].$value).toBe("{color.neutral.600}");
    expect(tokens.color.semantic.dark.background.$value).toBe("{color.neutral.950}");
  });

  it("writes dimensions as value plus unit", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_VIBE_DS));
    expect(tokens.radius.md.$value).toEqual({ value: Number.parseFloat(FIXTURE_VIBE_DS.radius.md), unit: "rem" });
    expect(tokens.typography.size.base.$value).toEqual({ value: 1, unit: "rem" });
    expect(tokens.spacing["0-5"].$value).toEqual({ value: 0.5, unit: "rem" });
    expect(tokens.spacing.unit.$value).toEqual({ value: 0.25, unit: "rem" });
    expect(tokens.breakpoint.md.$value).toEqual({ value: 48, unit: "rem" });
  });

  it("writes shadows, durations, easing curves and typography roles as their own types", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_VIBE_DS));
    const sm = tokens.shadow.light.sm;
    expect(sm.$type).toBe("shadow");
    expect(sm.$value).toHaveLength(2);
    expect(sm.$value[0].color.colorSpace).toBe("oklch");
    expect(sm.$value[0].color.alpha).toBe(0.1);
    expect(sm.$value[0].offsetY).toEqual({ value: 1, unit: "px" });
    expect(tokens.motion.duration.base).toEqual({ $type: "duration", $value: { value: 180, unit: "ms" } });
    expect(tokens.motion.ease.out).toEqual({ $type: "cubicBezier", $value: [0.2, 0, 0, 1] });
    expect(tokens.typography.weight.bold).toEqual({ $type: "fontWeight", $value: 700 });
    expect(tokens.typography.leading.base).toEqual({ $type: "number", $value: 1.5 });
    expect(tokens.typography.body.$type).toBe("typography");
    expect(tokens.typography.body.$value.fontFamily).toBe("{font.body}");
    expect(tokens.typography.body.$value.fontSize).toBe("{typography.size.base}");
    expect(tokens.$extensions["com.kernic"].measure).toBe("65ch");
    expect(tokens.container.measure).toBeUndefined();
  });

  it("carries gradients in the kernic extension, never as tokens of an unknown type", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_VIBE_DS));
    expect(tokens.$extensions["com.kernic"].gradients).toEqual(FIXTURE_VIBE_DS.gradients);
    expect(Object.keys(tokens.color).filter((k) => k.startsWith("gradient-"))).toEqual([]);
    expect(JSON.stringify(tokens)).not.toContain('"unknown"');
  });

  it("has no gradients key in the extension when the system has none", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_EDGE_DS));
    expect(tokens.$extensions["com.kernic"].gradients).toBeUndefined();
    expect(tokens.$extensions["com.kernic"].generator).toBe("kernic");
  });

  it("uses only $type values the format defines", () => {
    const text = dtcgTokens(FIXTURE_VIBE_DS);
    const types = new Set([...text.matchAll(/"\$type": "([^"]+)"/g)].map((m) => m[1]));
    expect([...types].sort()).toEqual([
      "color",
      "cubicBezier",
      "dimension",
      "duration",
      "fontFamily",
      "fontWeight",
      "number",
      "shadow",
      "typography",
    ]);
  });
});

describe("dtcgDimension", () => {
  it("parses px, rem and em", () => {
    expect(dtcgDimension("4px").$value).toEqual({ value: 4, unit: "px" });
    expect(dtcgDimension("0.25rem").$value).toEqual({ value: 0.25, unit: "rem" });
    expect(dtcgDimension("-0.02em").$value).toEqual({ value: -0.02, unit: "em" });
  });

  it("refuses anything else rather than guessing", () => {
    expect(() => dtcgDimension("auto")).toThrow(/Not a dimension/);
    expect(() => dtcgDimension("12")).toThrow(/Not a dimension/);
  });
});

describe("agentRule", () => {
  it("names the system, its vibe and DESIGN.md so a pasted rule stays unambiguous", () => {
    const rule = agentRule(FIXTURE_VIBE_DS);
    expect(rule).toContain(FIXTURE_VIBE_DS.name);
    expect(rule).toContain(`vibe: ${FIXTURE_VIBE_DS.vibe}`);
    expect(rule).toContain("./DESIGN.md");
  });

  it("is a single line, so it can be pasted into CLAUDE.md as one rule", () => {
    expect(agentRule(FIXTURE_VIBE_DS)).not.toContain("\n");
  });

  it("joins exactly the lines the CLI prints, so CLI and MCP copy cannot drift", () => {
    expect(agentRule(FIXTURE_VIBE_DS)).toBe(agentRuleLines(FIXTURE_VIBE_DS).join(" "));
  });

  it("honours a custom brief path", () => {
    expect(agentRule(FIXTURE_VIBE_DS, "./docs/DESIGN.md")).toContain("./docs/DESIGN.md");
  });
});
