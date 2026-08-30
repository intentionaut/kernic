import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyToProject,
  createSystemTool,
  isKernicOwned,
  resolveTargetDir,
  runTool,
  safeJoin,
  serverVersion,
  startMcp,
} from "./mcp.ts";
import { agentRule, designBrief, dtcgTokens } from "./context.ts";
import { contextArtifacts, exportCss, exportFonts, exportTailwind } from "./export.ts";
import { listProjects, MUTE_ENV_VAR } from "./projects.ts";
import { loadSystem, saveSystem } from "./storage.ts";
import { FIXTURE_VIBE_DS } from "./test/fixtures.ts";
import { LOOKS } from "./studio/looks.ts";
import { VIBES } from "./vibes.ts";

describe("runTool", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-mcp-test-"));
    process.env.KERNIC_HOME_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.KERNIC_HOME_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  describe("list_systems", () => {
    it("points a stuck agent at the tools that unstick it when nothing is saved", async () => {
      const out = await runTool("list_systems", {});
      expect(out).toContain("No design systems saved yet.");
      expect(out).toContain("list_looks");
      expect(out).toContain("create_system");
    });

    it("lists each saved system on its own line with vibe, fonts, and created date", async () => {
      await saveSystem(FIXTURE_VIBE_DS);
      const out = await runTool("list_systems", {});
      expect(out).toBe(
        `${FIXTURE_VIBE_DS.name} — vibe: ${FIXTURE_VIBE_DS.vibe} · fonts: ${FIXTURE_VIBE_DS.fonts.heading} / ${FIXTURE_VIBE_DS.fonts.body} / ${FIXTURE_VIBE_DS.fonts.mono} · created ${FIXTURE_VIBE_DS.createdAt.slice(0, 10)}`
      );
    });
  });

  describe("get_system", () => {
    it("throws a specific, actionable error for an unknown system", async () => {
      await expect(runTool("get_system", { name: "nope" })).rejects.toThrow(
        `Design system not found: "nope". Call list_systems first.`
      );
    });

    it("returns the full system as pretty JSON", async () => {
      await saveSystem(FIXTURE_VIBE_DS);
      const out = await runTool("get_system", { name: FIXTURE_VIBE_DS.name });
      expect(JSON.parse(out)).toEqual(FIXTURE_VIBE_DS);
      expect(out).toBe(JSON.stringify(FIXTURE_VIBE_DS, null, 2));
    });
  });

  describe("get_tokens", () => {
    beforeEach(async () => {
      await saveSystem(FIXTURE_VIBE_DS);
    });

    it.each([
      ["design-md", () => designBrief(FIXTURE_VIBE_DS)],
      ["css", () => exportCss(FIXTURE_VIBE_DS)],
      ["tailwind", () => exportTailwind(FIXTURE_VIBE_DS)],
      ["fonts", () => exportFonts(FIXTURE_VIBE_DS)],
      ["dtcg", () => dtcgTokens(FIXTURE_VIBE_DS)],
      ["json", () => JSON.stringify(FIXTURE_VIBE_DS, null, 2)],
    ] as const)("format=%s matches calling the exporter directly", async (format, expected) => {
      const out = await runTool("get_tokens", { name: FIXTURE_VIBE_DS.name, format });
      expect(out).toBe(expected());
    });

    it("defaults to design-md when no format is given", async () => {
      const out = await runTool("get_tokens", { name: FIXTURE_VIBE_DS.name });
      expect(out).toBe(designBrief(FIXTURE_VIBE_DS));
    });

    it("throws a specific error for an unknown format", async () => {
      await expect(runTool("get_tokens", { name: FIXTURE_VIBE_DS.name, format: "yaml" })).rejects.toThrow(
        `Unknown format "yaml". Use design-md | css | tailwind | fonts | dtcg | json.`
      );
    });
  });

  describe("list_vibes", () => {
    it("lists one entry per vibe, with chromaScale/lRange only for vibes that set them", async () => {
      const out = await runTool("list_vibes", {});
      const lines = out.split("\n").filter((l) => l.startsWith("- "));
      expect(lines.length).toBe(VIBES.length);

      const funLine = lines.find((l) => l.startsWith("- fun:"))!;
      const nextLine = out.split("\n")[out.split("\n").indexOf(funLine) + 1];
      expect(nextLine).toContain("chromaScale 1.25");
      expect(nextLine).toContain("lRange [0.46, 0.94]");

      const techLine = lines.find((l) => l.startsWith("- tech:"))!;
      const techNextLine = out.split("\n")[out.split("\n").indexOf(techLine) + 1];
      expect(techNextLine).not.toContain("chromaScale");
      expect(techNextLine).not.toContain("lRange");
    });
  });

  it("throws for an unknown tool", async () => {
    await expect(runTool("not_a_tool", {})).rejects.toThrow("Unknown tool: not_a_tool");
  });
});

describe("startMcp (stdio JSON-RPC loop)", () => {
  let dir: string;
  let writes: string[];
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-mcp-stdio-test-"));
    process.env.KERNIC_HOME_DIR = dir;
    writes = [];
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
  });
  afterEach(async () => {
    writeSpy.mockRestore();
    delete process.env.KERNIC_HOME_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  async function run(lines: string[]) {
    const stdin = Readable.from(lines.map((l) => l + "\n"));
    const originalStdin = process.stdin;
    Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
    try {
      await startMcp();
    } finally {
      Object.defineProperty(process, "stdin", { value: originalStdin, configurable: true });
    }
  }

  const replies = () => writes.map((w) => JSON.parse(w));

  it("echoes the requested protocol version on initialize", async () => {
    await run([JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2099-01-01" } })]);
    expect(replies()[0].result.protocolVersion).toBe("2099-01-01");
  });

  it("returns the tool definitions verbatim for tools/list", async () => {
    await run([JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })]);
    const tools = replies()[0].result.tools;
    expect(tools.map((t: any) => t.name)).toEqual([
      "list_systems",
      "get_system",
      "get_tokens",
      "apply_to_project",
      "create_system",
      "list_looks",
      "list_vibes",
    ]);
  });

  it("tools/call happy path returns a text result", async () => {
    await run([JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_systems", arguments: {} } })]);
    const reply = replies()[0];
    expect(reply.result.content[0].text).toContain("No design systems saved yet.");
    expect(reply.result.isError).toBeUndefined();
  });

  it("tools/call error path returns a result with isError:true, not a JSON-RPC-level error", async () => {
    await run([JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } })]);
    const reply = replies()[0];
    expect(reply.error).toBeUndefined();
    expect(reply.result.isError).toBe(true);
    expect(reply.result.content[0].text).toContain("Unknown tool: nope");
  });

  it("an unknown method still gets a JSON-RPC-level error", async () => {
    await run([JSON.stringify({ jsonrpc: "2.0", id: 5, method: "not/a/method" })]);
    const reply = replies()[0];
    expect(reply.result).toBeUndefined();
    expect(reply.error.code).toBe(-32601);
  });

  it("silently ignores blank lines and invalid JSON without crashing", async () => {
    await run(["", "   ", "{ not valid json", JSON.stringify({ jsonrpc: "2.0", id: 6, method: "ping" })]);
    expect(replies().length).toBe(1);
    expect(replies()[0].id).toBe(6);
  });

  it("sends no reply for a notification (no id)", async () => {
    await run([JSON.stringify({ jsonrpc: "2.0", method: "tools/list" })]);
    expect(writes.length).toBe(0);
  });
});

describe("serverVersion", () => {
  it("reports the real package version instead of a hardcoded literal", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(serverVersion()).toBe(pkg.version);
    // The bug this replaced: serverInfo claimed 0.1.0 while the package shipped 0.1.5.
    expect(serverVersion()).not.toBe("0.1.0");
  });
});

describe("resolveTargetDir", () => {
  const home = "/home/someone";
  const cwd = "/home/someone/projects/app";

  it("defaults to the server's working directory", () => {
    expect(resolveTargetDir(undefined, { cwd, home })).toBe(cwd);
    expect(resolveTargetDir("", { cwd, home })).toBe(cwd);
  });

  it("resolves a relative directory against the working directory", () => {
    expect(resolveTargetDir("packages/web", { cwd, home })).toBe("/home/someone/projects/app/packages/web");
  });

  it("accepts an absolute directory", () => {
    expect(resolveTargetDir("/srv/other-app", { cwd, home })).toBe("/srv/other-app");
  });

  it("rejects a leading .. segment", () => {
    expect(() => resolveTargetDir("../elsewhere", { cwd, home })).toThrow(/\.\." path segments are not allowed/);
  });

  it("rejects an embedded .. segment, which a plain prefix strip would miss", () => {
    expect(() => resolveTargetDir("packages/../../../etc", { cwd, home })).toThrow(/not allowed/);
  });

  it("rejects .. written with backslashes", () => {
    expect(() => resolveTargetDir("packages\\..\\..\\etc", { cwd, home })).toThrow(/not allowed/);
  });

  it("rejects .. even when it would have resolved to somewhere harmless", () => {
    expect(() => resolveTargetDir("packages/../web", { cwd, home })).toThrow(/not allowed/);
  });

  it("refuses the filesystem root", () => {
    expect(() => resolveTargetDir("/", { cwd, home })).toThrow(/filesystem root/);
  });

  it("refuses the home directory itself, but not a project inside it", () => {
    expect(() => resolveTargetDir(home, { cwd, home })).toThrow(/home directory itself/);
    expect(resolveTargetDir(`${home}/my-app`, { cwd, home })).toBe(`${home}/my-app`);
  });

  it("refuses a working directory that is itself the home directory", () => {
    expect(() => resolveTargetDir(undefined, { cwd: home, home })).toThrow(/home directory itself/);
  });

  it("rejects a non-string directory", () => {
    expect(() => resolveTargetDir(42, { cwd, home })).toThrow(/expected a string/);
    expect(() => resolveTargetDir({ path: "/tmp" }, { cwd, home })).toThrow(/expected a string/);
  });

  it("rejects a path containing a null byte", () => {
    expect(() => resolveTargetDir("/tmp/app\0/etc", { cwd, home })).toThrow(/null byte/);
  });
});

describe("safeJoin", () => {
  it("joins a plain filename inside the directory", () => {
    expect(safeJoin("/srv/app", "design.md")).toBe("/srv/app/design.md");
  });

  it("refuses a filename that climbs out of the directory", () => {
    expect(() => safeJoin("/srv/app", "../design.md")).toThrow(/resolves outside/);
    expect(() => safeJoin("/srv/app", "../../etc/passwd")).toThrow(/resolves outside/);
  });

  it("refuses an absolute filename that would escape entirely", () => {
    expect(() => safeJoin("/srv/app", "/etc/passwd")).toThrow(/resolves outside/);
  });

  it("refuses a nested filename, because kernic only writes at the top level", () => {
    expect(() => safeJoin("/srv/app", "sub/design.md")).toThrow(/resolves outside/);
  });

  it("refuses a directory-prefix impostor", () => {
    // /srv/app-evil starts with /srv/app as a string, but is not inside it.
    expect(() => safeJoin("/srv/app", "../app-evil/design.md")).toThrow(/resolves outside/);
  });
});

describe("isKernicOwned", () => {
  it("recognises every artifact kernic generates", () => {
    expect(isKernicOwned("design.md", designBrief(FIXTURE_VIBE_DS))).toBe(true);
    expect(isKernicOwned("tokens.json", dtcgTokens(FIXTURE_VIBE_DS))).toBe(true);
    expect(isKernicOwned("tokens.dtcg.json", dtcgTokens(FIXTURE_VIBE_DS))).toBe(true);
    expect(isKernicOwned("tokens.css", exportCss(FIXTURE_VIBE_DS))).toBe(true);
    expect(isKernicOwned("tailwind.css", exportTailwind(FIXTURE_VIBE_DS))).toBe(true);
    expect(isKernicOwned("fonts.html", exportFonts(FIXTURE_VIBE_DS))).toBe(true);
  });

  it("does not claim a user's own file at the same name", () => {
    expect(isKernicOwned("design.md", "# My design notes\n")).toBe(false);
    expect(isKernicOwned("tokens.json", JSON.stringify({ color: { brand: "#f00" } }))).toBe(false);
    expect(isKernicOwned("tokens.css", ":root { --brand: #f00; }")).toBe(false);
    expect(isKernicOwned("tailwind.css", "@import 'tailwindcss';")).toBe(false);
  });

  it("does not choke on a tokens.json that is not valid JSON", () => {
    expect(isKernicOwned("tokens.json", "{ truncated")).toBe(false);
    expect(isKernicOwned("tokens.json", "null")).toBe(false);
    expect(isKernicOwned("tokens.json", "[]")).toBe(false);
  });

  it("claims nothing at an unknown filename", () => {
    expect(isKernicOwned("package.json", "{}")).toBe(false);
  });
});

describe("apply_to_project", () => {
  let home: string;
  let workspace: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "kernic-apply-home-"));
    workspace = await mkdtemp(join(tmpdir(), "kernic-apply-ws-"));
    process.env.KERNIC_HOME_DIR = home;
    delete process.env[MUTE_ENV_VAR];
    await saveSystem(FIXTURE_VIBE_DS);
  });
  afterEach(async () => {
    delete process.env.KERNIC_HOME_DIR;
    delete process.env[MUTE_ENV_VAR];
    await rm(home, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  });

  const projectDir = async (name: string) => {
    const dir = join(workspace, name);
    await mkdir(dir, { recursive: true });
    return dir;
  };

  it("writes design.md and tokens.json into the target project", async () => {
    const dir = await projectDir("app");
    const out = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir });
    expect(out).toContain(join(dir, "design.md"));
    expect(out).toContain(join(dir, "tokens.json"));
    expect(await readFile(join(dir, "design.md"), "utf8")).toBe(designBrief(FIXTURE_VIBE_DS));
    expect(await readFile(join(dir, "tokens.json"), "utf8")).toBe(dtcgTokens(FIXTURE_VIBE_DS));
  });

  it("returns the same paste-in rule the CLI prints, so the two cannot drift", async () => {
    const out = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: await projectDir("app") });
    expect(out).toContain(agentRule(FIXTURE_VIBE_DS));
    expect(out).toContain("CLAUDE.md");
    expect(out).toContain(".cursorrules");
  });

  it("writes the extra stylesheets when asked", async () => {
    const dir = await projectDir("app");
    await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir, include: ["css", "tailwind"] });
    expect(await readFile(join(dir, "tokens.css"), "utf8")).toBe(exportCss(FIXTURE_VIBE_DS));
    expect(await readFile(join(dir, "tailwind.css"), "utf8")).toBe(exportTailwind(FIXTURE_VIBE_DS));
  });

  it("rejects an unknown include entry", async () => {
    const dir = await projectDir("app");
    await expect(applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir, include: ["scss"] })).rejects.toThrow(
      /Invalid include entry/
    );
    await expect(applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir, include: "css" })).rejects.toThrow(
      /expected an array/
    );
  });

  it("refuses to escape the target directory", async () => {
    await expect(
      applyToProject({ name: FIXTURE_VIBE_DS.name, directory: "../somewhere-else" }, { cwd: workspace })
    ).rejects.toThrow(/not allowed/);
  });

  it("refuses the home directory and the filesystem root", async () => {
    await expect(
      applyToProject({ name: FIXTURE_VIBE_DS.name, directory: workspace }, { cwd: workspace, home: workspace })
    ).rejects.toThrow(/home directory itself/);
    await expect(applyToProject({ name: FIXTURE_VIBE_DS.name, directory: "/" })).rejects.toThrow(/filesystem root/);
  });

  it("refuses a directory that does not exist rather than creating one", async () => {
    const missing = join(workspace, "not-created-yet");
    await expect(applyToProject({ name: FIXTURE_VIBE_DS.name, directory: missing })).rejects.toThrow(
      /Directory does not exist/
    );
    await expect(readFile(join(missing, "design.md"), "utf8")).rejects.toThrow();
  });

  it("refuses a path that is a file, not a directory", async () => {
    const file = join(workspace, "a-file");
    await writeFile(file, "hi", "utf8");
    await expect(applyToProject({ name: FIXTURE_VIBE_DS.name, directory: file })).rejects.toThrow(/Not a directory/);
  });

  it("refuses an unknown system before touching the disk", async () => {
    const dir = await projectDir("app");
    await expect(applyToProject({ name: "nope", directory: dir })).rejects.toThrow(/Design system not found/);
    await expect(readFile(join(dir, "design.md"), "utf8")).rejects.toThrow();
  });

  it("leaves a file kernic did not write alone, and says exactly which one", async () => {
    const dir = await projectDir("app");
    await writeFile(join(dir, "tokens.json"), '{"mine":true}', "utf8");
    const out = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir });

    expect(await readFile(join(dir, "tokens.json"), "utf8")).toBe('{"mine":true}');
    expect(out).toContain("Left alone");
    expect(out).toContain("tokens.json");
    expect(out).toContain("overwrite: true");
    // The file it does own still gets written.
    expect(await readFile(join(dir, "design.md"), "utf8")).toBe(designBrief(FIXTURE_VIBE_DS));
  });

  it("replaces a foreign file only when overwrite is explicitly true, and reports it", async () => {
    const dir = await projectDir("app");
    await writeFile(join(dir, "tokens.json"), '{"mine":true}', "utf8");
    const out = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir, overwrite: true });
    expect(await readFile(join(dir, "tokens.json"), "utf8")).toBe(dtcgTokens(FIXTURE_VIBE_DS));
    expect(out).toContain("was not written by kernic");
  });

  it("replaces its own earlier output without asking, and says so", async () => {
    const dir = await projectDir("app");
    await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir });
    const out = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir });
    expect(out).toContain("Replaced an earlier version of");
    expect(out).not.toContain("Left alone");
  });

  it("writes nothing and says so when every file is someone else's", async () => {
    const dir = await projectDir("app");
    await writeFile(join(dir, "design.md"), "# mine", "utf8");
    await writeFile(join(dir, "tokens.json"), "{}", "utf8");
    const out = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir });
    expect(out).toContain("Wrote nothing");
    expect(await readFile(join(dir, "design.md"), "utf8")).toBe("# mine");
    expect(await listProjects()).toEqual([]);
  });

  it("records the application in the project registry", async () => {
    const dir = await projectDir("app");
    await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir }, { now: "2026-01-01T00:00:00.000Z" });
    const records = await listProjects();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      path: dir,
      system: FIXTURE_VIBE_DS.name,
      appliedAt: "2026-01-01T00:00:00.000Z",
      files: ["design.md", "tokens.json"],
    });
  });

  it("records only the files it actually wrote", async () => {
    const dir = await projectDir("app");
    await writeFile(join(dir, "tokens.json"), '{"mine":true}', "utf8");
    await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: dir });
    expect((await listProjects())[0].files).toEqual(["design.md"]);
  });

  it("says nothing about a portfolio on the first project", async () => {
    const out = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: await projectDir("one") });
    expect(out).not.toMatch(/manual/i);
  });

  it("mentions holding one identity across apps on the second project, exactly once", async () => {
    await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: await projectDir("one") });
    const two = await projectDir("two");
    const first = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: two });
    expect(first).toContain("2 projects");
    expect(first).toContain("kernic apps");
    const again = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: two });
    expect(again).not.toContain("2 projects");
  });

  it("stays silent about the portfolio when the user has opted out", async () => {
    process.env[MUTE_ENV_VAR] = "1";
    await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: await projectDir("one") });
    const out = await applyToProject({ name: FIXTURE_VIBE_DS.name, directory: await projectDir("two") });
    expect(out).not.toMatch(/manual/i);
    expect(out).toContain("Wrote:");
  });

  it("is reachable through runTool", async () => {
    const dir = await projectDir("app");
    const out = await runTool("apply_to_project", { name: FIXTURE_VIBE_DS.name, directory: dir });
    expect(out).toContain("Applied");
  });
});

describe("create_system", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "kernic-create-home-"));
    process.env.KERNIC_HOME_DIR = home;
  });
  afterEach(async () => {
    delete process.env.KERNIC_HOME_DIR;
    await rm(home, { recursive: true, force: true });
  });

  it("creates and saves a system from a vibe", async () => {
    const out = await createSystemTool({ name: "from-vibe", vibe: "tech" });
    expect(out).toContain('Created "from-vibe"');
    const saved = await loadSystem("from-vibe");
    expect(saved?.vibe).toBe("tech");
    expect(saved?.schemaVersion).toBe(1);
  });

  it("creates and saves a system from a look, tagged with the look's vibe family", async () => {
    const look = LOOKS.find((l) => l.id === "terminal")!;
    const out = await createSystemTool({ name: "from-look", look: "terminal" });
    expect(out).toContain(look.label);
    const saved = await loadSystem("from-look");
    expect(saved?.vibe).toBe(look.vibeId);
    expect(saved?.fonts).toEqual(look.fonts);
    expect(saved?.radius.style).toBe(look.radius);
    expect(saved?.typeScale.ratio).toBe(look.ratio);
  });

  it("carries a look's chroma and lightness compression through to the ramps", async () => {
    // "sticker-shock" is one of the Fun looks, which set chromaScale + lRange.
    await createSystemTool({ name: "loud", look: "sticker-shock" });
    const plain = await createSystemTool({ name: "quiet", look: "paper-ink" });
    expect(plain).toContain("Created");
    const loud = await loadSystem("loud");
    expect(loud?.colors.primary["500"]).toBeTruthy();
    expect(loud?.radius.style).toBe("pill");
  });

  it("prefers the look when both a look and a vibe are given", async () => {
    await createSystemTool({ name: "both", look: "terminal", vibe: "corporate" });
    expect((await loadSystem("both"))?.vibe).toBe("tech");
  });

  it("builds every curated look without throwing", async () => {
    for (const look of LOOKS) {
      await expect(createSystemTool({ name: `look-${look.id}`, look: look.id })).resolves.toContain("Created");
    }
  });

  it("slugifies the name the same way the CLI does", async () => {
    await createSystemTool({ name: "My Brand!!", vibe: "tech" });
    expect(await loadSystem("my-brand")).not.toBeNull();
  });

  it("rejects a name that slugifies to nothing", async () => {
    await expect(createSystemTool({ name: "   ", vibe: "tech" })).rejects.toThrow(/slugifies to nothing/);
    await expect(createSystemTool({ name: "!!!", vibe: "tech" })).rejects.toThrow(/slugifies to nothing/);
  });

  it("rejects a missing or non-string name", async () => {
    await expect(createSystemTool({ vibe: "tech" })).rejects.toThrow(/requires a name/);
    await expect(createSystemTool({ name: 7, vibe: "tech" })).rejects.toThrow(/requires a name/);
  });

  it("refuses to overwrite an existing system", async () => {
    await createSystemTool({ name: "taken", vibe: "tech" });
    await expect(createSystemTool({ name: "Taken", vibe: "corporate" })).rejects.toThrow(/already exists/);
    expect((await loadSystem("taken"))?.vibe).toBe("tech");
  });

  it("rejects an unknown vibe or look, naming where to look them up", async () => {
    await expect(createSystemTool({ name: "x", vibe: "nope" })).rejects.toThrow(/Unknown vibe "nope"/);
    await expect(createSystemTool({ name: "x", look: "nope" })).rejects.toThrow(/Unknown look "nope"/);
  });

  it("asks for a look or a vibe when given neither", async () => {
    await expect(createSystemTool({ name: "x" })).rejects.toThrow(/needs a look or a vibe/);
  });

  it("is reachable through runTool", async () => {
    await expect(runTool("create_system", { name: "via-run-tool", vibe: "tech" })).resolves.toContain("Created");
  });
});

describe("list_looks", () => {
  it("lists every curated look with its vibe, seeds and fonts", async () => {
    const out = await runTool("list_looks", {});
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.length).toBe(LOOKS.length);
    for (const look of LOOKS) {
      expect(out).toContain(`- ${look.id}: ${look.label} — vibe ${look.vibeId}`);
      expect(out).toContain(look.primarySeed);
      expect(out).toContain(look.accentSeed);
    }
  });

  it("filters to one vibe family", async () => {
    const out = await runTool("list_looks", { vibe: "minimal" });
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.length).toBe(LOOKS.filter((l) => l.vibeId === "minimal").length);
    expect(lines.every((l) => l.includes("vibe minimal"))).toBe(true);
  });

  it("distinguishes a tinted neutral from a pure gray one", async () => {
    const out = await runTool("list_looks", { vibe: "minimal" });
    expect(out).toContain("pure gray neutral");
    expect(await runTool("list_looks", { vibe: "tech" })).toContain("neutral tint");
  });

  it("errors usefully for a vibe with no looks", async () => {
    await expect(runTool("list_looks", { vibe: "not-a-vibe" })).rejects.toThrow(/No looks for vibe "not-a-vibe"/);
  });

  it("exposes every look id create_system will accept", async () => {
    const out = await runTool("list_looks", {});
    for (const look of LOOKS) expect(out).toContain(look.id);
  });
});
