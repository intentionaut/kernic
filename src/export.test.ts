import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { designBrief, dtcgTokens } from "./context.ts";
import { shadcnRegistryItem } from "./shadcn.ts";
import {
  CONTEXT_FILES,
  EXPORT_FORMATS,
  FORMAT_LIST,
  contextArtifacts,
  exportArtifacts,
  isKernicOwned,
  planArtifacts,
  exportCss,
  exportFileName,
  exportFonts,
  exportTailwind,
  isExportFormat,
  renderExport,
  renderProjectFile,
  writeArtifacts,
  writeContext,
} from "./export.ts";
import { FIXTURE_EDGE_DS, FIXTURE_VIBE_DS } from "./test/fixtures.ts";
import { RAMP_STOPS } from "./types.ts";

describe("exportCss", () => {
  it("matches a stable snapshot for the vibe fixture", () => {
    expect(exportCss(FIXTURE_VIBE_DS)).toMatchSnapshot();
  });

  it("emits exactly RAMP_STOPS.length * 3 color variable lines (3 ramps)", () => {
    const out = exportCss(FIXTURE_VIBE_DS);
    const lines = out.split("\n").filter((l) => /^\s*--color-(primary|accent|neutral)-\d+:/.test(l));
    expect(lines.length).toBe(RAMP_STOPS.length * 3);
  });

  it("emits --primary, --primary-hover and --accent aliasing the same ramp stops DESIGN.md's frontmatter promises", () => {
    const out = exportCss(FIXTURE_VIBE_DS);
    expect(out).toContain("--primary: var(--color-primary-600);");
    expect(out).toContain("--primary-hover: var(--color-primary-500);");
    expect(out).toContain("--accent: var(--color-accent-500);");
  });

  it("omits the gradient section when gradients is undefined", () => {
    expect(exportCss(FIXTURE_EDGE_DS)).not.toContain("/* Gradients */");
  });

  it("omits the gradient section when gradients is an empty object", () => {
    const ds = { ...FIXTURE_EDGE_DS, gradients: {} };
    expect(exportCss(ds)).not.toContain("/* Gradients */");
  });

  it("includes the gradient section when gradients are present", () => {
    expect(exportCss(FIXTURE_VIBE_DS)).toContain("/* Gradients */");
  });
});

describe("exportTailwind", () => {
  it("matches a stable snapshot for the vibe fixture", () => {
    expect(exportTailwind(FIXTURE_VIBE_DS)).toMatchSnapshot();
  });

  it("emits no --background-image-* lines when gradients is an empty object (different guard than exportCss, same net output)", () => {
    const ds = { ...FIXTURE_EDGE_DS, gradients: {} };
    expect(exportTailwind(ds)).not.toMatch(/--background-image-/);
  });

  it("emits no --background-image-* lines when gradients is undefined", () => {
    expect(exportTailwind(FIXTURE_EDGE_DS)).not.toMatch(/--background-image-/);
  });

  it("emits --background-image-* lines when gradients are present", () => {
    expect(exportTailwind(FIXTURE_VIBE_DS)).toMatch(/--background-image-primary:/);
  });

  it("emits --primary, --primary-hover and --accent for both modes, plus @theme inline aliases", () => {
    const out = exportTailwind(FIXTURE_VIBE_DS);
    expect(out.match(/--primary: var\(--color-primary-600\);/g)?.length).toBe(2);
    expect(out.match(/--primary-hover: var\(--color-primary-500\);/g)?.length).toBe(2);
    expect(out.match(/--accent: var\(--color-accent-500\);/g)?.length).toBe(2);
    expect(out).toContain("--color-primary: var(--primary);");
    expect(out).toContain("--color-primary-hover: var(--primary-hover);");
    expect(out).toContain("--color-accent: var(--accent);");
  });
});

describe("exportFonts", () => {
  it("matches a stable snapshot for the vibe fixture", () => {
    expect(exportFonts(FIXTURE_VIBE_DS)).toMatchSnapshot();
  });

  it("dedupes <link> tags when heading and body share the same family", () => {
    // FIXTURE_EDGE_DS: heading === body === "DM Serif Display", mono is distinct.
    const out = exportFonts(FIXTURE_EDGE_DS);
    const linkTags = out.match(/<link href="[^"]+" rel="stylesheet">/g) ?? [];
    expect(linkTags.length).toBe(2); // one for the shared heading/body family, one for mono
  });

  it("emits 3 distinct <link> tags when all three fonts differ", () => {
    const out = exportFonts(FIXTURE_VIBE_DS);
    const linkTags = out.match(/<link href="[^"]+" rel="stylesheet">/g) ?? [];
    expect(linkTags.length).toBe(3);
  });
});

describe("artifact registry", () => {
  it("renders every declared format without throwing", () => {
    for (const format of EXPORT_FORMATS) {
      expect(renderExport(FIXTURE_VIBE_DS, format).length).toBeGreaterThan(0);
    }
  });

  it("routes each format to the matching exporter", () => {
    expect(renderExport(FIXTURE_VIBE_DS, "css")).toBe(exportCss(FIXTURE_VIBE_DS));
    expect(renderExport(FIXTURE_VIBE_DS, "tailwind")).toBe(exportTailwind(FIXTURE_VIBE_DS));
    expect(renderExport(FIXTURE_VIBE_DS, "fonts")).toBe(exportFonts(FIXTURE_VIBE_DS));
    expect(renderExport(FIXTURE_VIBE_DS, "dtcg")).toBe(dtcgTokens(FIXTURE_VIBE_DS));
    expect(renderExport(FIXTURE_VIBE_DS, "design-md")).toBe(designBrief(FIXTURE_VIBE_DS));
    expect(JSON.parse(renderExport(FIXTURE_VIBE_DS, "json"))).toEqual(FIXTURE_VIBE_DS);
  });

  it("exposes dtcg and design-md as first-class formats (they used to be MCP-only)", () => {
    expect(EXPORT_FORMATS).toContain("dtcg");
    expect(EXPORT_FORMATS).toContain("design-md");
    expect(isExportFormat("dtcg")).toBe(true);
    expect(isExportFormat("design-md")).toBe(true);
  });

  it("rejects an unknown format with the canonical format list", () => {
    expect(() => renderExport(FIXTURE_VIBE_DS, "yaml")).toThrow(`Unknown format "yaml". Use ${FORMAT_LIST}.`);
    expect(() => exportFileName("yaml")).toThrow(`Unknown format "yaml". Use ${FORMAT_LIST}.`);
    expect(() => exportArtifacts(FIXTURE_VIBE_DS, "yaml")).toThrow(`Unknown format "yaml". Use ${FORMAT_LIST}.`);
  });

  it("lists every format it can render in FORMAT_LIST, plus all", () => {
    for (const format of EXPORT_FORMATS) expect(FORMAT_LIST).toContain(format);
    expect(FORMAT_LIST).toContain("all");
  });

  it("keeps the published filenames for the pre-0.1.5 formats", () => {
    expect(exportFileName("css")).toBe("tokens.css");
    expect(exportFileName("tailwind")).toBe("tailwind.css");
    expect(exportFileName("json")).toBe("tokens.json");
    expect(exportFileName("fonts")).toBe("fonts.html");
  });

  it("gives the DTCG export its own filename so -f json keeps tokens.json", () => {
    expect(exportFileName("dtcg")).toBe("tokens.dtcg.json");
    expect(exportFileName("json")).toBe("tokens.json");
  });
});

describe("exportArtifacts", () => {
  it("-f all now includes design.md and the DTCG tokens alongside the original four", () => {
    const files = exportArtifacts(FIXTURE_VIBE_DS, "all").map((a) => a.file);
    // The four -f all has always written...
    expect(files).toEqual(expect.arrayContaining(["tokens.css", "tailwind.css", "tokens.json", "fonts.html"]));
    // ...plus the standard files an agent and a shadcn project read.
    expect(files).toContain("DESIGN.md");
    expect(files).toContain("tokens.dtcg.json");
    expect(files).toContain("shadcn.json");
  });

  it("writes unique filenames for -f all", () => {
    const files = exportArtifacts(FIXTURE_VIBE_DS, "all").map((a) => a.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("returns exactly one artifact for a single format", () => {
    expect(exportArtifacts(FIXTURE_VIBE_DS, "css")).toEqual([
      { file: "tokens.css", content: exportCss(FIXTURE_VIBE_DS) },
    ]);
  });
});

describe("contextArtifacts", () => {
  it("is one file per standard by default: DESIGN.md, DTCG tokens.json, shadcn.json", () => {
    expect(contextArtifacts(FIXTURE_VIBE_DS)).toEqual([
      { file: "DESIGN.md", content: designBrief(FIXTURE_VIBE_DS) },
      { file: "tokens.json", content: dtcgTokens(FIXTURE_VIBE_DS) },
      { file: "shadcn.json", content: shadcnRegistryItem(FIXTURE_VIBE_DS) },
    ]);
    expect([...CONTEXT_FILES]).toEqual(["DESIGN.md", "tokens.json", "shadcn.json"]);
  });

  it("appends requested stylesheets", () => {
    const files = contextArtifacts(FIXTURE_VIBE_DS, ["css", "tailwind"]).map((a) => a.file);
    expect(files).toEqual(["DESIGN.md", "tokens.json", "shadcn.json", "tokens.css", "tailwind.css"]);
  });

  it("leaves out a standard file on request", () => {
    const files = contextArtifacts(FIXTURE_VIBE_DS, [], ["shadcn.json"]).map((a) => a.file);
    expect(files).toEqual(["DESIGN.md", "tokens.json"]);
  });

  it("ignores extras that would repeat a standard file under another name", () => {
    const files = contextArtifacts(FIXTURE_VIBE_DS, ["json", "dtcg", "design-md", "shadcn"]).map((a) => a.file);
    expect(files).toEqual(["DESIGN.md", "tokens.json", "shadcn.json"]);
  });

  it("does not duplicate a stylesheet requested twice", () => {
    const files = contextArtifacts(FIXTURE_VIBE_DS, ["css", "css"]).map((a) => a.file);
    expect(files).toEqual(["DESIGN.md", "tokens.json", "shadcn.json", "tokens.css"]);
  });
});

describe("renderProjectFile", () => {
  it("regenerates every filename kernic writes into a project, including the pre-0.2.0 brief name", () => {
    expect(renderProjectFile(FIXTURE_VIBE_DS, "DESIGN.md")).toBe(designBrief(FIXTURE_VIBE_DS));
    expect(renderProjectFile(FIXTURE_VIBE_DS, "design.md")).toBe(designBrief(FIXTURE_VIBE_DS));
    expect(renderProjectFile(FIXTURE_VIBE_DS, "shadcn.json")).toBe(shadcnRegistryItem(FIXTURE_VIBE_DS));
    expect(renderProjectFile(FIXTURE_VIBE_DS, "tokens.json")).toBe(dtcgTokens(FIXTURE_VIBE_DS));
    expect(renderProjectFile(FIXTURE_VIBE_DS, "tokens.dtcg.json")).toBe(dtcgTokens(FIXTURE_VIBE_DS));
    expect(renderProjectFile(FIXTURE_VIBE_DS, "tokens.css")).toBe(exportCss(FIXTURE_VIBE_DS));
    expect(renderProjectFile(FIXTURE_VIBE_DS, "tailwind.css")).toBe(exportTailwind(FIXTURE_VIBE_DS));
    expect(renderProjectFile(FIXTURE_VIBE_DS, "fonts.html")).toBe(exportFonts(FIXTURE_VIBE_DS));
  });

  it("returns null for a filename kernic does not own, rather than guessing", () => {
    expect(renderProjectFile(FIXTURE_VIBE_DS, "package.json")).toBeNull();
    expect(renderProjectFile(FIXTURE_VIBE_DS, "")).toBeNull();
  });
});

describe("writeArtifacts / writeContext", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-export-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes DESIGN.md, tokens.json and shadcn.json with content matching the pure builders", async () => {
    const written = await writeContext(FIXTURE_VIBE_DS, dir);
    expect(written).toEqual([join(dir, "DESIGN.md"), join(dir, "tokens.json"), join(dir, "shadcn.json")]);

    expect(await readFile(join(dir, "DESIGN.md"), "utf8")).toBe(designBrief(FIXTURE_VIBE_DS));
    expect(await readFile(join(dir, "tokens.json"), "utf8")).toBe(dtcgTokens(FIXTURE_VIBE_DS));
    expect(await readFile(join(dir, "shadcn.json"), "utf8")).toBe(shadcnRegistryItem(FIXTURE_VIBE_DS));
  });

  it("creates the target directory when it does not exist", async () => {
    const nested = join(dir, "a", "b");
    const written = await writeArtifacts(nested, [{ file: "x.txt", content: "hi" }]);
    expect(written).toEqual([join(nested, "x.txt")]);
    expect(await readFile(join(nested, "x.txt"), "utf8")).toBe("hi");
  });

  it("writes every -f all artifact to disk", async () => {
    const written = await writeArtifacts(dir, exportArtifacts(FIXTURE_VIBE_DS, "all"));
    expect(written.map((path) => path.replace(`${dir}/`, ""))).toEqual([
      "tokens.css",
      "tailwind.css",
      "tokens.json",
      "fonts.html",
      "tokens.dtcg.json",
      "DESIGN.md",
      "shadcn.json",
    ]);
  });
});

describe("planArtifacts — never destroys a file the user owns", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-plan-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const pair = () => contextArtifacts(FIXTURE_VIBE_DS);

  it("writes everything into an empty directory", async () => {
    const plan = await planArtifacts(dir, pair());
    expect(plan.toWrite.map((a) => a.file)).toEqual(["DESIGN.md", "tokens.json", "shadcn.json"]);
    expect(plan.blocked).toEqual([]);
  });

  it("blocks a tokens.json the user wrote, and still writes the rest", async () => {
    // tokens.json is also Style Dictionary's and Tokens Studio's filename.
    await writeFile(join(dir, "tokens.json"), '{"my":"config"}', "utf8");
    const plan = await planArtifacts(dir, pair());
    expect(plan.blocked).toEqual(["tokens.json"]);
    expect(plan.toWrite.map((a) => a.file)).toEqual(["DESIGN.md", "shadcn.json"]);
    expect(await readFile(join(dir, "tokens.json"), "utf8")).toBe('{"my":"config"}');
  });

  it("blocks a shadcn.json from a registry kernic did not write", async () => {
    await writeFile(join(dir, "shadcn.json"), '{"name":"theirs","type":"registry:style"}', "utf8");
    const plan = await planArtifacts(dir, pair());
    expect(plan.blocked).toEqual(["shadcn.json"]);
  });

  it("replaces a tokens.json kernic itself wrote", async () => {
    await writeFile(join(dir, "tokens.json"), dtcgTokens(FIXTURE_VIBE_DS), "utf8");
    const plan = await planArtifacts(dir, pair());
    expect(plan.blocked).toEqual([]);
    expect(plan.replaced).toEqual(["tokens.json"]);
  });

  it("replaces a foreign file only when force is set, and says whose it was", async () => {
    await writeFile(join(dir, "tokens.json"), '{"my":"config"}', "utf8");
    const plan = await planArtifacts(dir, pair(), { force: true });
    expect(plan.blocked).toEqual([]);
    expect(plan.replaced).toEqual(["tokens.json (was not written by kernic)"]);
    expect(plan.toWrite).toHaveLength(3);
  });

  it("protects every artifact -f all writes, not just tokens.json", async () => {
    await writeFile(join(dir, "tokens.css"), "body { color: red }", "utf8");
    await writeFile(join(dir, "DESIGN.md"), "# my own notes", "utf8");
    const plan = await planArtifacts(dir, exportArtifacts(FIXTURE_VIBE_DS, "all"));
    expect(plan.blocked).toEqual(expect.arrayContaining(["tokens.css", "DESIGN.md"]));
  });

  it("treats a truncated or invalid kernic file as the user's", async () => {
    await writeFile(join(dir, "tokens.json"), "{ not json", "utf8");
    const plan = await planArtifacts(dir, pair());
    expect(plan.blocked).toEqual(["tokens.json"]);
  });
});

describe("isKernicOwned", () => {
  it("recognises each artifact kernic generates", () => {
    expect(isKernicOwned("DESIGN.md", designBrief(FIXTURE_VIBE_DS))).toBe(true);
    expect(isKernicOwned("tokens.json", dtcgTokens(FIXTURE_VIBE_DS))).toBe(true);
    expect(isKernicOwned("shadcn.json", shadcnRegistryItem(FIXTURE_VIBE_DS))).toBe(true);
    expect(isKernicOwned("tokens.css", exportCss(FIXTURE_VIBE_DS))).toBe(true);
  });

  it("still recognises a design.md written by a version before 0.2.0", () => {
    const legacy = "# acme — design system\n\n> Generated by [kernic](https://github.com/intentionaut/kernic) · vibe: tech\n";
    expect(isKernicOwned("design.md", legacy)).toBe(true);
  });

  it("does not claim a lookalike from another tokens tool", () => {
    expect(isKernicOwned("tokens.json", '{"color":{"red":{"value":"#f00"}}}')).toBe(false);
    expect(isKernicOwned("DESIGN.md", "---\nname: mine\n---\n# Design notes\nby hand")).toBe(false);
    expect(isKernicOwned("shadcn.json", '{"name":"theirs","type":"registry:style"}')).toBe(false);
    expect(isKernicOwned("tokens.css", ":root { --brand: red }")).toBe(false);
  });

  it("never claims a filename it does not generate", () => {
    expect(isKernicOwned("package.json", '{"$extensions":{"com.kernic":{}}}')).toBe(false);
  });
});
