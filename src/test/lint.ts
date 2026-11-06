import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Path to Google's DESIGN.md linter (a dev dependency). */
export const linter = fileURLToPath(new URL("../../node_modules/@google/design.md/dist/index.js", import.meta.url));

/** Runs the linter over one file. It exits non-zero on findings, so read stdout either way. */
export function lint(file: string): { summary: { errors: number; warnings: number } } {
  let out: string;
  try {
    out = execFileSync(process.execPath, [linter, "lint", file], { encoding: "utf8" });
  } catch (err: any) {
    out = String(err.stdout ?? "");
    if (!out.trim()) throw err;
  }
  return JSON.parse(out);
}
