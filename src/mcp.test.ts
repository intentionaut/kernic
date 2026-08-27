import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool, startMcp } from "./mcp.ts";
import { designBrief, dtcgTokens } from "./context.ts";
import { exportCss, exportFonts, exportTailwind } from "./export.ts";
import { saveSystem } from "./storage.ts";
import { FIXTURE_VIBE_DS } from "./test/fixtures.ts";
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
    it("reports no systems when none are saved", async () => {
      expect(await runTool("list_systems", {})).toBe("No design systems saved yet.");
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
    expect(tools.map((t: any) => t.name)).toEqual(["list_systems", "get_system", "get_tokens", "list_vibes"]);
  });

  it("tools/call happy path returns a text result", async () => {
    await run([JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_systems", arguments: {} } })]);
    const reply = replies()[0];
    expect(reply.result.content[0].text).toBe("No design systems saved yet.");
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
