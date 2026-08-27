import { describe, expect, it } from "vitest";
import { buildNeutral, oklchToHex } from "./color.ts";
import { renderPalette, renderRamp } from "./swatch.ts";
import { RAMP_STOPS } from "./types.ts";

// renderRamp always iterates the full fixed stop list, so any ramp passed to
// it must define every stop or it hits undefined mid-loop. Build a full ramp
// with the same color repeated at every stop for boundary-color tests below.
const uniformRamp = (hex: string) => Object.fromEntries(RAMP_STOPS.map((s) => [s, hex]));

describe("renderRamp", () => {
  it("emits one ANSI background block per of the 11 stops, in order", () => {
    const ramp = buildNeutral();
    const out = renderRamp("neutral", ramp);
    const blocks = out.match(/\x1b\[48;2;\d+;\d+;\d+m/g) ?? [];
    expect(blocks.length).toBe(11);
    expect(out.startsWith("neutral ")).toBe(true);
  });

  it("picks a black foreground for a real ramp's lightest stop and white for its darkest", () => {
    // Neutral "50" is near-white (l≈0.975); "950" is near-black (l≈0.19).
    const ramp = buildNeutral();
    const out = renderRamp("n", ramp);
    const idx50 = out.indexOf(" 50 ");
    const idx950 = out.indexOf(" 950 ");
    expect(out.slice(Math.max(0, idx50 - 40), idx50)).toContain("\x1b[38;2;0;0;0m");
    expect(out.slice(Math.max(0, idx950 - 40), idx950)).toContain("\x1b[38;2;255;255;255m");
  });

  it("flips at the luminance threshold correctly for known boundary colors", () => {
    const lightGray = oklchToHex({ l: 0.85, c: 0, h: 0 });
    const darkGray = oklchToHex({ l: 0.3, c: 0, h: 0 });
    expect(renderRamp("x", uniformRamp(lightGray))).toContain("\x1b[38;2;0;0;0m");
    expect(renderRamp("x", uniformRamp(darkGray))).toContain("\x1b[38;2;255;255;255m");
  });
});

describe("renderPalette", () => {
  it("renders one line per ramp, in Object.entries order", () => {
    const colors = { primary: buildNeutral(), accent: buildNeutral() };
    const out = renderPalette(colors);
    const lines = out.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0].startsWith("primary ")).toBe(true);
    expect(lines[1].startsWith("accent ")).toBe(true);
  });
});
