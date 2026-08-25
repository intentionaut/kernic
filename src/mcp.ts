import { createInterface } from "node:readline";
import { designBrief, dtcgTokens } from "./context.ts";
import { exportCss, exportFonts, exportTailwind } from "./export.ts";
import { listSystems, loadSystem } from "./storage.ts";
import type { DesignSystem } from "./types.ts";
import { VIBES } from "./vibes.ts";

/**
 * Zero-dependency MCP (Model Context Protocol) server over stdio.
 * Lets AI agents — Claude Code, Cursor, Windsurf, … — read kernic
 * design systems directly:
 *
 *   claude mcp add kernic -- npx kernic mcp
 */

const TOOL_DEFS = [
  {
    name: "list_systems",
    description: "List locally saved kernic design systems with their vibes and fonts.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_system",
    description: "Get the full design system spec (all ramps, semantic tokens, fonts, radius, gradients) as JSON.",
    inputSchema: {
      type: "object" as const,
      properties: { name: { type: "string", description: "Design system name (see list_systems)" } },
      required: ["name"],
    },
  },
  {
    name: "get_tokens",
    description:
      "Export a design system in a usable format. Prefer design-md for coding sessions: it includes the adherence rules agents must follow.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Design system name" },
        format: {
          type: "string",
          enum: ["design-md", "css", "tailwind", "fonts", "dtcg", "json"],
          description: "design-md = agent brief + rules; css = CSS vars; tailwind = v4 @theme; fonts = <link> tags; dtcg = W3C design tokens; json = raw kernic file",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_vibes",
    description: "List available kernic vibe presets (seed colors and personality) for creating new systems.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
];

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

async function mustLoad(name?: unknown): Promise<DesignSystem> {
  const ds = typeof name === "string" ? await loadSystem(name) : null;
  if (!ds) throw new Error(`Design system not found: ${JSON.stringify(name ?? "")}. Call list_systems first.`);
  return ds;
}

async function runTool(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case "list_systems": {
      const systems = await listSystems();
      if (systems.length === 0) return "No design systems saved yet.";
      return systems
        .map(
          (s) =>
            `${s.name} — vibe: ${s.vibe} · fonts: ${s.fonts.heading} / ${s.fonts.body} / ${s.fonts.mono} · created ${s.createdAt.slice(0, 10)}`
        )
        .join("\n");
    }
    case "get_system":
      return JSON.stringify(await mustLoad(args.name), null, 2);
    case "get_tokens": {
      const ds = await mustLoad(args.name);
      switch (args.format ?? "design-md") {
        case "design-md":
          return designBrief(ds);
        case "css":
          return exportCss(ds);
        case "tailwind":
          return exportTailwind(ds);
        case "fonts":
          return exportFonts(ds);
        case "dtcg":
          return dtcgTokens(ds);
        case "json":
          return JSON.stringify(ds, null, 2);
        default:
          throw new Error(`Unknown format "${args.format}". Use design-md | css | tailwind | fonts | dtcg | json.`);
      }
    }
    case "list_vibes":
      return VIBES.map((v) => {
        const extra = [
          v.chromaScale != null ? `chromaScale ${v.chromaScale}` : null,
          v.lRange ? `lRange [${v.lRange[0]}, ${v.lRange[1]}]` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return `- ${v.id}: ${v.label} — ${v.description}\n  primary ${v.primarySeed} · accent ${v.accentSeed}${extra ? ` · ${extra}` : ""}`;
      }).join("\n");
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function startMcp(): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  process.on("SIGINT", () => process.exit(0));
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg: any;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue; // tolerate stray output on stdin
    }
    if (msg?.id === undefined || msg?.id === null) continue; // notification — no reply
    try {
      switch (msg.method) {
        case "initialize":
          send({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: msg.params?.protocolVersion ?? "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "kernic", version: "0.1.0" },
            },
          });
          break;
        case "tools/list":
          send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOL_DEFS } });
          break;
        case "tools/call":
          try {
            const text = await runTool(msg.params?.name, msg.params?.arguments ?? {});
            send({ jsonrpc: "2.0", id: msg.id, result: textResult(text) });
          } catch (err: any) {
            send({ jsonrpc: "2.0", id: msg.id, result: textResult(err?.message ?? String(err), true) });
          }
          break;
        case "ping":
          send({ jsonrpc: "2.0", id: msg.id, result: {} });
          break;
        default:
          send({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32601, message: `Method not found: ${msg.method}` },
          });
      }
    } catch (err: any) {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: err?.message ?? "Internal error" } });
    }
  }
}
