import { describe, expect, it } from "vitest";
import { SEMANTIC_KEYS, findRampStop, semanticEntries } from "./semantic.ts";
import { FIXTURE_VIBE_DS } from "./test/fixtures.ts";

describe("semanticEntries", () => {
  it("lists every role once, in the published order, with light and dark values", () => {
    const entries = semanticEntries(FIXTURE_VIBE_DS);
    expect(entries.map((e) => e.key)).toEqual([...SEMANTIC_KEYS]);
    expect(entries.find((e) => e.key === "mutedText")?.css).toBe("muted-text");
    const ring = entries.find((e) => e.key === "ring")!;
    expect(ring.light).toBe(ring.dark);
  });
});

describe("findRampStop", () => {
  it("locates a hex on its ramp regardless of case", () => {
    const hex = FIXTURE_VIBE_DS.colors.accent["300"];
    expect(findRampStop(FIXTURE_VIBE_DS, hex.toUpperCase())).toEqual({ ramp: "accent", stop: "300" });
  });

  it("returns null for a colour that is not on any ramp", () => {
    expect(findRampStop(FIXTURE_VIBE_DS, "#123456")).toBeNull();
  });
});
