import { describe, expect, it } from "vitest";
import { agentRule, agentRuleLines, designBrief, dtcgTokens } from "./context.ts";
import { FIXED_CREATED_AT, FIXTURE_EDGE_DS, FIXTURE_VIBE_DS } from "./test/fixtures.ts";

// writeContext moved to export.ts (next to the other renderers, so one module
// owns the format -> filename map). Its tests live in export.test.ts.

describe("designBrief", () => {
  it("contains all 7 numbered rules for AI agents", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    for (let n = 1; n <= 7; n++) {
      expect(brief).toContain(`${n}. `);
    }
  });

  it("uses the fixture's frozen created date", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    expect(brief).toContain(FIXED_CREATED_AT.slice(0, 10));
  });

  it("builds ramp-table swatch URLs without the leading # on the hex", () => {
    const brief = designBrief(FIXTURE_VIBE_DS);
    const hex = FIXTURE_VIBE_DS.colors.primary["500"];
    expect(brief).toContain(`https://placehold.co/24x12/${hex.slice(1)}/${hex.slice(1)}`);
    expect(brief).not.toContain(`placehold.co/24x12/${hex}/`);
  });

  it("includes a Gradients section only when the design system has gradients", () => {
    expect(designBrief(FIXTURE_VIBE_DS)).toContain("## Gradients");
    expect(designBrief(FIXTURE_EDGE_DS)).not.toContain("## Gradients");
  });
});

describe("dtcgTokens", () => {
  it("produces valid JSON with the documented shape", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_VIBE_DS));
    expect(tokens.color.primary["500"].$type).toBe("color");
    expect(tokens.color.primary["500"].$value).toBe(FIXTURE_VIBE_DS.colors.primary["500"]);
    expect(tokens.color.semantic.light["muted-text"].$value).toBe(FIXTURE_VIBE_DS.semantic.mutedText.light);
    expect(tokens.$extensions["com.kernic"].vibe).toBe(FIXTURE_VIBE_DS.vibe);
  });

  it("includes gradient tokens with a mirrored cssValue extension when gradients exist", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_VIBE_DS));
    const [name, value] = Object.entries(FIXTURE_VIBE_DS.gradients!)[0];
    const token = tokens.color[`gradient-${name}`];
    expect(token.$value).toBe(value);
    expect(token.$extensions["com.kernic.cssValue"]).toBe(value);
  });

  it("has no gradient token keys when the design system has no gradients", () => {
    const tokens = JSON.parse(dtcgTokens(FIXTURE_EDGE_DS));
    const gradientKeys = Object.keys(tokens.color).filter((k) => k.startsWith("gradient-"));
    expect(gradientKeys.length).toBe(0);
  });
});

describe("agentRule", () => {
  it("names the system and its vibe so a pasted rule stays unambiguous", () => {
    const rule = agentRule(FIXTURE_VIBE_DS);
    expect(rule).toContain(FIXTURE_VIBE_DS.name);
    expect(rule).toContain(`vibe: ${FIXTURE_VIBE_DS.vibe}`);
    expect(rule).toContain("./design.md");
  });

  it("is a single line, so it can be pasted into CLAUDE.md as one rule", () => {
    expect(agentRule(FIXTURE_VIBE_DS)).not.toContain("\n");
  });

  it("joins exactly the lines the CLI prints, so CLI and MCP copy cannot drift", () => {
    expect(agentRule(FIXTURE_VIBE_DS)).toBe(agentRuleLines(FIXTURE_VIBE_DS).join(" "));
  });

  it("honours a custom brief path", () => {
    expect(agentRule(FIXTURE_VIBE_DS, "./docs/design.md")).toContain("./docs/design.md");
  });
});
