import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildFromLook } from "./build.ts";
import { EXAMPLES_CREATED_AT, EXAMPLES_DIR, renderExamples, staleExampleFolders, writeExamples } from "./examples.ts";
import { LOOKS } from "./studio/looks.ts";
import { lint } from "./test/lint.ts";

const rendered = renderExamples();

describe("buildFromLook", () => {
  it("builds the system from the look's own seeds, fonts, radius and ratio", () => {
    const look = LOOKS[0]!;
    const ds = buildFromLook(look, "mine", EXAMPLES_CREATED_AT);
    expect(ds.name).toBe("mine");
    expect(ds.vibe).toBe(look.vibeId);
    expect(ds.fonts).toEqual(look.fonts);
    expect(ds.radius.style).toBe(look.radius);
    expect(ds.typeScale.ratio).toBe(look.ratio);
    expect(ds.createdAt).toBe(EXAMPLES_CREATED_AT);
  });

  it("stamps the clock when no date is given", () => {
    const { createdAt } = buildFromLook(LOOKS[0]!, "mine");
    expect(createdAt).not.toBe(EXAMPLES_CREATED_AT);
    expect(Number.isNaN(Date.parse(createdAt))).toBe(false);
  });
});

describe("renderExamples", () => {
  it("renders a DESIGN.md and a tailwind.css for every look", () => {
    expect(rendered.map((r) => r.path)).toEqual(LOOKS.flatMap((l) => [`${l.id}/DESIGN.md`, `${l.id}/tailwind.css`]));
  });

  it("holds still between runs", () => {
    expect(renderExamples()).toEqual(rendered);
  });
});

describe("examples/ folder", () => {
  it("holds one folder per look, no more", () => {
    expect(existsSync(EXAMPLES_DIR), "examples/ is missing. Run: npm run examples").toBe(true);
    for (const folder of staleExampleFolders()) {
      expect.fail(`examples/${folder} has no matching look. Run: npm run examples`);
    }
    const folders = readdirSync(EXAMPLES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
    expect(folders).toHaveLength(LOOKS.length);
  });

  it.each(rendered)("examples/$path is up to date", ({ path, content }) => {
    const file = join(EXAMPLES_DIR, path);
    expect(existsSync(file), `examples/${path} is missing. Run: npm run examples`).toBe(true);
    expect(readFileSync(file, "utf8") === content, `examples/${path} is out of date. Run: npm run examples`).toBe(true);
  });

  it.each(LOOKS.map((l) => l.id))("examples/%s/DESIGN.md passes the DESIGN.md linter", (id) => {
    const { errors, warnings } = lint(join(EXAMPLES_DIR, id, "DESIGN.md")).summary;
    expect(
      errors === 0 && warnings === 0,
      `examples/${id}/DESIGN.md failed the DESIGN.md linter: ${errors} errors, ${warnings} warnings`
    ).toBe(true);
  });
});

describe("writeExamples", () => {
  let tmp: string;
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));
  const fresh = () => (tmp = mkdtempSync(join(tmpdir(), "kernic-examples-")));

  it("creates the folder when missing and writes every file", () => {
    const dir = join(fresh(), "examples");
    expect(writeExamples(dir)).toBe(LOOKS.length * 2);
    for (const { path, content } of rendered) expect(readFileSync(join(dir, path), "utf8")).toBe(content);
  });

  it("removes a stale folder that holds only generated files", () => {
    const dir = fresh();
    mkdirSync(join(dir, "old-id"));
    writeFileSync(join(dir, "old-id", "DESIGN.md"), "x");
    expect(staleExampleFolders(dir)).toEqual(["old-id"]);
    writeExamples(dir);
    expect(existsSync(join(dir, "old-id"))).toBe(false);
  });

  it("stops on a stale folder that holds anything else", () => {
    const dir = fresh();
    mkdirSync(join(dir, "old-id"));
    writeFileSync(join(dir, "old-id", "notes.txt"), "mine");
    expect(() => writeExamples(dir)).toThrow(/examples\/old-id holds files kernic did not write/);
    expect(existsSync(join(dir, "old-id", "notes.txt"))).toBe(true);
  });

  it("names the file and the fix when it cannot write", () => {
    const dir = fresh();
    writeFileSync(join(dir, LOOKS[0]!.id), "a file where a folder should go");
    expect(() => writeExamples(dir)).toThrow(
      new RegExp(`Could not write examples/${LOOKS[0]!.id}/DESIGN.md: .*Check you can write to this folder, then run: npm run examples`)
    );
  });
});
