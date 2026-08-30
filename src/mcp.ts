import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, parse, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { buildDesignSystem, buildFromVibe } from "./build.ts";
import { buildNeutral, buildRamp } from "./color.ts";
import { agentRule, designBrief, dtcgTokens } from "./context.ts";
import {
  contextArtifacts,
  exportCss,
  exportFonts,
  exportTailwind,
  isKernicOwned,
  planArtifacts,
  writeArtifacts,
  type Artifact,
  type ExportFormat,
} from "./export.ts";
import { claimNotice, multiProjectFingerprint, multiProjectNote, recordApplication } from "./projects.ts";
import { listSystems, loadSystem, normalizeName, saveSystem } from "./storage.ts";
import { LOOKS } from "./studio/looks.ts";
import type { DesignSystem } from "./types.ts";
import { RADIUS_PRESETS, VIBES, getVibe } from "./vibes.ts";

/**
 * Zero-dependency MCP (Model Context Protocol) server over stdio.
 * Lets AI agents — Claude Code, Cursor, Windsurf, … — read kernic
 * design systems directly:
 *
 *   claude mcp add kernic -- npx kernic mcp
 *
 * Four of the tools read. Two write: create_system saves a design system,
 * apply_to_project writes files into a directory on the user's disk. Everything
 * those two touch is validated here rather than trusted from the model.
 */

/** Stylesheet formats apply_to_project will write alongside the brief. */
const APPLY_EXTRAS = ["css", "tailwind"] as const;
type ApplyExtra = (typeof APPLY_EXTRAS)[number];

/** Real package version, so serverInfo doesn't drift from what's published. */
export function serverVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
    if (typeof pkg.version === "string" && pkg.version.length > 0) return pkg.version;
  } catch {
    // Best-effort: an unusual install layout must not stop the server starting.
  }
  return "0.0.0";
}

const TOOL_DEFS = [
  {
    name: "list_systems",
    description:
      "List locally saved kernic design systems with their vibes and fonts. Call this first in any styling task — if it returns nothing, use list_looks + create_system to make one rather than inventing colors.",
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
      "Export a design system in a usable format, into the conversation. Prefer design-md for coding sessions: it includes the adherence rules agents must follow. Use apply_to_project instead when the files should be saved into the user's project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Design system name" },
        format: {
          type: "string",
          enum: ["design-md", "css", "tailwind", "fonts", "dtcg", "json"],
          description:
            "design-md = agent brief + rules; css = CSS vars; tailwind = v4 @theme; fonts = <link> tags; dtcg = W3C design tokens; json = raw kernic file",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "apply_to_project",
    description:
      "Write a design system into a project on disk: design.md (the agent brief and its rules) and tokens.json (W3C DTCG tokens), optionally tokens.css and tailwind.css. Use this when the user asks to set up, apply, or use a design system in the app you are working on — it is what makes the system stick across future sessions, where get_tokens only puts it in this conversation. Returns the one-line rule to paste into CLAUDE.md / AGENTS.md / .cursorrules. Files kernic did not write are never overwritten unless overwrite is true; they are reported back instead.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Design system name (see list_systems)" },
        directory: {
          type: "string",
          description:
            "Project directory to write into. Absolute, or relative to the server's working directory. Must already exist. Defaults to the working directory. '..' segments are rejected.",
        },
        include: {
          type: "array",
          items: { type: "string", enum: [...APPLY_EXTRAS] },
          description:
            "Extra stylesheets to write: 'css' → tokens.css, 'tailwind' → tailwind.css. Omit for just the brief and tokens.",
        },
        overwrite: {
          type: "boolean",
          description:
            "Replace files at these names that kernic did not write. Default false — ask the user before setting this.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "create_system",
    description:
      "Create and save a new design system from a curated look (preferred — see list_looks) or a vibe preset (see list_vibes). Use this when the user has no system yet, so they never have to leave the session to run the CLI. Follow it with apply_to_project to put the system into their project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Name for the system. Slugified — 'My Brand' becomes 'my-brand'." },
        look: { type: "string", description: "Look id from list_looks. Takes precedence over vibe." },
        vibe: { type: "string", description: `Vibe id from list_vibes (${VIBES.map((v) => v.id).join(", ")}).` },
      },
      required: ["name"],
    },
  },
  {
    name: "list_looks",
    description:
      "List the curated looks — complete identities (seed colors, fonts, radius, type scale) grouped under the vibe families. This is the best starting point for create_system: a look is a finished design decision, where a vibe is only a direction. Show the user the options and let them pick rather than choosing for them.",
    inputSchema: {
      type: "object" as const,
      properties: {
        vibe: { type: "string", description: "Only looks in this vibe family (optional)." },
      },
      required: [],
    },
  },
  {
    name: "list_vibes",
    description:
      "List the kernic vibe presets (seed colors and personality). Broader than list_looks — use it when the user wants a direction rather than a finished identity.",
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

/* ─────────────────────── apply_to_project safety ───────────────────────
 * This is a write tool driven by a language model, so the target directory is
 * untrusted input. Three separate properties are enforced:
 *   1. the argument cannot walk out of where it appears to point ('..'),
 *   2. the resolved directory is a real, existing, non-catastrophic target,
 *   3. every file lands directly inside it — proven, not pattern-matched.
 * -------------------------------------------------------------------- */

export interface ResolveDirOptions {
  cwd?: string;
  home?: string;
}

/** Reject a directory whose only plausible use is a mistake. */
function assertSaneTarget(dir: string, home: string): string {
  if (dir === parse(dir).root) {
    throw new Error(`Refusing to write to the filesystem root (${dir}). Pass the project directory instead.`);
  }
  if (dir === resolve(home)) {
    throw new Error(
      `Refusing to write to the home directory itself (${dir}). Pass a project directory inside it, e.g. ${join(dir, "my-app")}.`
    );
  }
  return dir;
}

/** Resolve and validate the requested target directory. Throws with a fixable message. */
export function resolveTargetDir(input: unknown, opts: ResolveDirOptions = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  if (input === undefined || input === null || input === "") return assertSaneTarget(resolve(cwd), home);
  if (typeof input !== "string") {
    throw new Error(`Invalid directory: expected a string, got ${typeof input}.`);
  }
  if (input.includes("\0")) throw new Error("Invalid directory: path contains a null byte.");
  // Blocking '..' outright is stricter than resolving it and checking the
  // result, and that is the point: an agent has no legitimate reason to climb
  // out of a path it just described to the user.
  if (input.split(/[\\/]+/).includes("..")) {
    throw new Error(
      `Refusing "${input}": ".." path segments are not allowed. Pass an absolute project directory, or a path inside the working directory.`
    );
  }
  return assertSaneTarget(resolve(cwd, input), home);
}

/** Join a filename onto dir, proving the result stays directly inside dir. */
export function safeJoin(dir: string, file: string): string {
  const path = resolve(dir, file);
  if (path !== join(dir, basename(file)) || !path.startsWith(dir.endsWith(sep) ? dir : dir + sep)) {
    throw new Error(`Refusing to write "${file}": it resolves outside ${dir}.`);
  }
  return path;
}

// The ownership check now lives beside the artifact registry in export.ts, so
// `kernic context` and `kernic export -o` get the same protection this tool has
// always had. Re-exported here because it was part of this module's surface.
export { isKernicOwned };

function parseExtras(include: unknown): ApplyExtra[] {
  if (include === undefined || include === null) return [];
  if (!Array.isArray(include)) throw new Error(`Invalid include: expected an array of ${APPLY_EXTRAS.join(" | ")}.`);
  const out: ApplyExtra[] = [];
  for (const entry of include) {
    if (typeof entry !== "string" || !(APPLY_EXTRAS as readonly string[]).includes(entry)) {
      throw new Error(`Invalid include entry ${JSON.stringify(entry)}. Use ${APPLY_EXTRAS.join(" or ")}.`);
    }
    if (!out.includes(entry as ApplyExtra)) out.push(entry as ApplyExtra);
  }
  return out;
}

export interface ApplyOptions {
  cwd?: string;
  home?: string;
  now?: string;
}

/** apply_to_project, split out so it is testable without the JSON-RPC loop. */
export async function applyToProject(args: Record<string, any>, opts: ApplyOptions = {}): Promise<string> {
  const ds = await mustLoad(args.name);
  const dir = resolveTargetDir(args.directory, opts);

  let info;
  try {
    info = await stat(dir);
  } catch {
    throw new Error(`Directory does not exist: ${dir}. Create it first, or pass an existing project directory.`);
  }
  if (!info.isDirectory()) throw new Error(`Not a directory: ${dir}.`);

  const extras = parseExtras(args.include);
  const candidates = contextArtifacts(ds, extras as readonly ExportFormat[]);
  const overwrite = args.overwrite === true;

  // safeJoin throws if a filename could ever resolve outside dir. Ownership is
  // then decided by the shared planner, so this tool and the two CLI write
  // paths can never disagree about whose file it is.
  for (const artifact of candidates) safeJoin(dir, artifact.file);
  const { toWrite, blocked, replaced } = await planArtifacts(dir, candidates, { force: overwrite });

  const written = toWrite.length > 0 ? await writeArtifacts(dir, toWrite) : [];

  const lines: string[] = [];
  if (written.length > 0) {
    lines.push(`Applied "${ds.name}" (vibe: ${ds.vibe}) to ${dir}`, "", "Wrote:");
    for (const path of written) lines.push(`  ${path}`);
  } else {
    lines.push(`Wrote nothing to ${dir} — every file already exists and kernic did not write it.`);
  }
  if (replaced.length > 0) {
    lines.push("", `Replaced an earlier version of: ${replaced.join(", ")}`);
  }
  if (blocked.length > 0) {
    lines.push(
      "",
      `Left alone (these already exist and kernic did not write them): ${blocked.join(", ")}`,
      "Ask the user before replacing them, then call apply_to_project again with overwrite: true."
    );
  }

  if (written.length > 0) {
    lines.push(
      "",
      "Tell the user to paste this line into CLAUDE.md / AGENTS.md / .cursorrules so future sessions pick it up:",
      "",
      `  ${agentRule(ds)}`,
      "",
      "For the rest of this session: read design.md and use only its tokens."
    );

    const result = await recordApplication({
      projectPath: dir,
      system: ds.name,
      artifacts: toWrite,
      now: opts.now,
    });
    if (result.isNewProject && result.projectCount >= 2) {
      if (await claimNotice(multiProjectFingerprint(result.projectCount))) {
        lines.push("", multiProjectNote(result.projectCount, ds.name));
      }
    }
  }

  return lines.join("\n");
}

/** create_system, split out for the same reason. */
export async function createSystemTool(args: Record<string, any>): Promise<string> {
  if (typeof args.name !== "string") throw new Error("create_system requires a name.");
  const name = normalizeName(args.name);
  if (!name) {
    throw new Error(`Invalid name ${JSON.stringify(args.name)} — it slugifies to nothing. Use letters or digits.`);
  }
  if (await loadSystem(name)) {
    throw new Error(`"${name}" already exists. Pick another name, or use get_system to read the existing one.`);
  }

  let ds: DesignSystem;
  let source: string;
  if (typeof args.look === "string" && args.look.length > 0) {
    const look = LOOKS.find((l) => l.id === args.look);
    if (!look) throw new Error(`Unknown look "${args.look}". Call list_looks for the available ids.`);
    const compress = { chromaScale: look.chromaScale ?? undefined, lRange: look.lRange ?? undefined };
    const colors = {
      primary: buildRamp(look.primarySeed, compress),
      accent: buildRamp(look.accentSeed, compress),
      neutral: buildNeutral(look.neutralTintHue ?? undefined),
    };
    ds = buildDesignSystem({
      name,
      vibeId: look.vibeId,
      colors,
      darkDefault: look.darkDefault,
      fonts: look.fonts,
      radiusStyle: look.radius,
      radius: RADIUS_PRESETS[look.radius],
      ratio: look.ratio,
    });
    source = `look: ${look.label} (${look.id})`;
  } else if (typeof args.vibe === "string" && args.vibe.length > 0) {
    const vibe = getVibe(args.vibe);
    if (!vibe) throw new Error(`Unknown vibe "${args.vibe}". Available: ${VIBES.map((v) => v.id).join(", ")}.`);
    ds = buildFromVibe(name, vibe);
    source = `vibe: ${vibe.label} (${vibe.id})`;
  } else {
    throw new Error(
      `create_system needs a look or a vibe. Call list_looks for finished identities, or list_vibes for the ${VIBES.length} broader presets.`
    );
  }

  await saveSystem(ds);
  return [
    `Created "${ds.name}" from ${source}.`,
    `  primary ${ds.colors.primary["600"]} · accent ${ds.colors.accent["500"]}`,
    `  fonts ${ds.fonts.heading} / ${ds.fonts.body} / ${ds.fonts.mono}`,
    `  radius ${ds.radius.style} · type ratio ${ds.typeScale.ratio}`,
    "",
    `Next: apply_to_project with name "${ds.name}" to write it into the project.`,
  ].join("\n");
}

export async function runTool(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case "list_systems": {
      const systems = await listSystems();
      if (systems.length === 0) {
        return "No design systems saved yet. Call list_looks, ask the user to pick one, then create_system.";
      }
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
    case "apply_to_project":
      return applyToProject(args);
    case "create_system":
      return createSystemTool(args);
    case "list_looks": {
      const filter = typeof args.vibe === "string" && args.vibe.length > 0 ? args.vibe : null;
      const looks = filter ? LOOKS.filter((l) => l.vibeId === filter) : LOOKS;
      if (looks.length === 0) {
        throw new Error(`No looks for vibe "${filter}". Available vibes: ${VIBES.map((v) => v.id).join(", ")}.`);
      }
      return looks
        .map((l) => {
          const extra = [
            l.neutralTintHue != null ? `neutral tint ${l.neutralTintHue}` : "pure gray neutral",
            l.darkDefault ? "dark by default" : "light by default",
            `radius ${l.radius}`,
            `type ratio ${l.ratio}`,
          ].join(", ");
          return `- ${l.id}: ${l.label} — vibe ${l.vibeId}\n  primary ${l.primarySeed} · accent ${l.accentSeed} · fonts ${l.fonts.heading} / ${l.fonts.body} / ${l.fonts.mono}\n  ${extra}`;
        })
        .join("\n");
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
              serverInfo: { name: "kernic", version: serverVersion() },
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
