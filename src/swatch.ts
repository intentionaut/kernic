import { hexToRgb } from "./color.ts";
import type { Ramp } from "./types.ts";

/** ANSI truecolor background block with a label. */
function swatch(hex: string, label?: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v * 255)) as [number, number, number];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const fg = lum > 0.55 ? "\x1b[38;2;0;0;0m" : "\x1b[38;2;255;255;255m";
  const text = ` ${label ?? hex} `;
  return `${fg}\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`;
}

export function renderRamp(name: string, ramp: Ramp): string {
  const stops = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
  const cells = stops.map((s) => swatch(ramp[s], s)).join("");
  return `${name.padEnd(8)} ${cells}`;
}

export function renderPalette(colors: object): string {
  return Object.entries(colors)
    .map(([name, ramp]) => renderRamp(name, ramp))
    .join("\n");
}
