import { describe, expect, it } from "vitest";
import { toYaml } from "./yaml.ts";

describe("toYaml", () => {
  it("writes nested maps two-space indented", () => {
    expect(toYaml({ a: { b: { c: 1 } } })).toBe("a:\n  b:\n    c: 1\n");
  });

  it("leaves plain words bare and quotes anything YAML would misread", () => {
    const out = toYaml({
      family: "Space Grotesk",
      hex: "#22d3ee",
      ref: "{colors.primary}",
      version: "1.0",
      flag: "true",
      empty: "",
      colon: "a: b",
      dash: "-0.02em",
      star: "*x",
      trailing: "x ",
    });
    expect(out).toContain("family: Space Grotesk\n");
    expect(out).toContain('hex: "#22d3ee"\n');
    expect(out).toContain('ref: "{colors.primary}"\n');
    expect(out).toContain('version: "1.0"\n');
    expect(out).toContain('flag: "true"\n');
    expect(out).toContain('empty: ""\n');
    expect(out).toContain('colon: "a: b"\n');
    expect(out).toContain('dash: "-0.02em"\n');
    expect(out).toContain('star: "*x"\n');
    expect(out).toContain('trailing: "x "\n');
  });

  it("quotes keys that are not plain identifiers", () => {
    expect(toYaml({ "0-5": "0.5rem", "2xl": 1, "a b": 2 })).toBe('"0-5": 0.5rem\n"2xl": 1\n"a b": 2\n');
  });

  it("writes numbers, booleans and null bare", () => {
    expect(toYaml({ n: 1.5, t: true, f: false, z: null })).toBe("n: 1.5\nt: true\nf: false\nz: null\n");
  });

  it("writes lists of scalars and lists of maps", () => {
    expect(toYaml({ items: ["a", "b"] })).toBe("items:\n  - a\n  - b\n");
    expect(toYaml({ omitted: [{ section: "components", reason: "later" }] })).toBe(
      "omitted:\n  - section: components\n    reason: later\n"
    );
  });

  it("writes empty containers inline", () => {
    expect(toYaml({ a: {}, b: [] })).toBe("a: {}\nb: []\n");
  });

  it("skips undefined values", () => {
    expect(toYaml({ a: 1, b: undefined as unknown as string })).toBe("a: 1\n");
  });
});
