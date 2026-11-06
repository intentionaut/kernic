import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFromLook } from "./build.ts";
import { designBrief } from "./context.ts";
import { exportTailwind } from "./export.ts";
import { LOOKS } from "./studio/looks.ts";

/** Fixed so the files hold still between runs; the DESIGN.md header prints this date. */
export const EXAMPLES_CREATED_AT = "2026-01-01T00:00:00.000Z";
export const EXAMPLE_FILES = ["DESIGN.md", "tailwind.css"] as const;
export const EXAMPLES_DIR = fileURLToPath(new URL("../examples", import.meta.url));

/** Every example file, path relative to examples/, content as kernic's own export code writes it. */
export function renderExamples(): { path: string; content: string }[] {
  return LOOKS.flatMap((look) => {
    const ds = buildFromLook(look, look.id, EXAMPLES_CREATED_AT);
    return [
      { path: `${look.id}/DESIGN.md`, content: designBrief(ds) },
      { path: `${look.id}/tailwind.css`, content: exportTailwind(ds) },
    ];
  });
}

/** Folders in examples/ that match no look. */
export function staleExampleFolders(dir = EXAMPLES_DIR): string[] {
  const ids = new Set(LOOKS.map((l) => l.id));
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !ids.has(e.name))
      .map((e) => e.name);
  } catch {
    return []; // no examples/ yet
  }
}

/** Rewrites every example. Removes a stale folder only if it holds nothing but the two generated files. Returns the file count. */
export function writeExamples(dir = EXAMPLES_DIR): number {
  for (const folder of staleExampleFolders(dir)) {
    const held = readdirSync(join(dir, folder));
    if (!held.every((f) => (EXAMPLE_FILES as readonly string[]).includes(f))) {
      throw new Error(`examples/${folder} holds files kernic did not write. Remove it yourself, then run: npm run examples`);
    }
    rmSync(join(dir, folder), { recursive: true });
  }
  const files = renderExamples();
  for (const { path, content } of files) {
    try {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), content, "utf8");
    } catch (err: any) {
      throw new Error(
        `Could not write examples/${path}: ${err?.message ?? err}. Check you can write to this folder, then run: npm run examples`
      );
    }
  }
  return files.length;
}
