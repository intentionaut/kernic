import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { designBrief, dtcgTokens, writeContext } from "./context.ts";
import { FIXED_CREATED_AT, FIXTURE_EDGE_DS, FIXTURE_VIBE_DS } from "./test/fixtures.ts";

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

describe("writeContext", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-context-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes design.md and tokens.json with content matching the pure builders", async () => {
    const written = await writeContext(FIXTURE_VIBE_DS, dir);
    expect(written).toEqual([join(dir, "design.md"), join(dir, "tokens.json")]);

    const md = await readFile(join(dir, "design.md"), "utf8");
    const json = await readFile(join(dir, "tokens.json"), "utf8");
    expect(md).toBe(designBrief(FIXTURE_VIBE_DS));
    expect(json).toBe(dtcgTokens(FIXTURE_VIBE_DS));
  });
});
