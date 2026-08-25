import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import {
  buildNeutral,
  buildRamp,
  harmonize,
  hexToOklch,
  oklchToHex,
  randomSeed,
  type Harmony,
} from "../color.ts";
import { semanticFromRamps } from "../build.ts";
import { getFontCatalog, searchFonts } from "../fonts.ts";
import { loadSystem, normalizeName, saveSystem } from "../storage.ts";
import type { DesignSystem, Ramp } from "../types.ts";
import { RADIUS_PRESETS, VIBES, type Vibe } from "../vibes.ts";

const STUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "studio");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

interface PaletteRequest {
  primaryHue?: number;
  primarySeed?: string;
  harmony?: Harmony;
  neutralTintHue?: number | null;
  accentSeed?: string;
}

function buildPalette(req: PaletteRequest) {
  const primarySeed =
    req.primarySeed ?? oklchToHex({ l: 0.6, c: 0.17, h: ((req.primaryHue ?? 220) % 360 + 360) % 360 });
  const accentSeed = req.accentSeed ?? harmonize(primarySeed, req.harmony ?? "analogous");
  const colors = {
    primary: buildRamp(primarySeed),
    accent: buildRamp(accentSeed),
    neutral: buildNeutral(req.neutralTintHue ?? undefined),
  };
  return {
    seeds: { primarySeed, accentSeed, neutralTintHue: req.neutralTintHue ?? null },
    colors,
    semantic: semanticFromRamps(colors, false),
    semanticDark: semanticFromRamps(colors, true),
  };
}

/** Best-effort seed recovery when editing a system that has no stored seeds. */
function deriveSeeds(ds: DesignSystem) {
  const fromExt = (ds.extensions as any)?.seeds;
  if (fromExt?.primarySeed || typeof fromExt?.primaryHue === "number") return fromExt;
  const p = hexToOklch(ds.colors.primary["600"]);
  const a = hexToOklch(ds.colors.accent["500"]);
  return {
    primarySeed: oklchToHex({ l: 0.6, c: Math.max(0.1, Math.min(0.2, p.c)), h: p.h }),
    accentSeed: ds.colors.accent["500"],
    neutralTintHue: null,
    harmonyHint: Math.round(a.h - p.h),
  };
}

function vibePublic(v: Vibe) {
  const { id, label, description, radius, typeRatio, fonts, darkModeDefault, primarySeed, accentSeed, neutralTintHue } = v;
  return { id, label, description, radius, typeRatio, fonts, darkModeDefault, primarySeed, accentSeed, neutralTintHue };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/meta") {
    return json(res, 200, {
      version: "0.1.0",
      vibes: VIBES.map(vibePublic),
      radii: RADIUS_PRESETS,
      ratios: [1.125, 1.2, 1.25, 1.333, 1.414, 1.618],
      spaces: [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16],
    }), true;
  }

  if (req.method === "GET" && path.startsWith("/api/fonts")) {
    const q = url.searchParams.get("q") ?? "";
    const { fonts, live } = await getFontCatalog();
    return json(res, 200, { results: await searchFonts(fonts, q, 30), live }), true;
  }

  if (req.method === "POST" && path === "/api/palette") {
    return json(res, 200, buildPalette(await readBody(req))), true;
  }

  if (req.method === "GET" && path.startsWith("/api/load/")) {
    const name = decodeURIComponent(path.slice("/api/load/".length));
    const ds = await loadSystem(name);
    if (!ds) return json(res, 404, { error: `Not found: ${name}` }), true;
    return json(res, 200, { system: ds, seeds: deriveSeeds(ds) }), true;
  }

  if (req.method === "POST" && path === "/api/save") {
    const body = (await readBody(req)) as DesignSystem & { extensions?: Record<string, unknown> };
    const name = normalizeName(body.name ?? "");
    if (!name) return json(res, 400, { error: "Invalid system name" }), true;
    if (!body.colors?.primary || !body.fonts) return json(res, 400, { error: "Malformed system" }), true;
    const ds: DesignSystem = {
      schemaVersion: 1,
      name,
      vibe: body.vibe ?? "custom",
      createdAt: new Date().toISOString(),
      colors: body.colors,
      semantic: body.semantic,
      fonts: body.fonts,
      radius: body.radius,
      typeScale: body.typeScale,
      extensions: body.extensions,
    };
    await saveSystem(ds);
    return json(res, 200, { ok: true, name }), true;
  }

  if (req.method === "GET" && path === "/api/random") {
    return json(res, 200, { seed: randomSeed() }), true;
  }

  return false;
}

async function serveStatic(res: ServerResponse, url: URL): Promise<void> {
  let rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  rel = normalize(rel).replace(/^(\.\.[\/\\])+/, "");
  try {
    const file = join(STUDIO_DIR, rel);
    const st = await stat(file);
    if (!st.isFile()) throw new Error();
    const ext = rel.slice(rel.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {}
}

export async function startStudio(name?: string, opts: { open?: boolean } = {}): Promise<void> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname.startsWith("/api/")) {
        const handled = await handleApi(req, res, url);
        if (!handled) json(res, 404, { error: "Unknown endpoint" });
        return;
      }
      await serveStatic(res, url);
    } catch (err: any) {
      json(res, 500, { error: err?.message ?? "Server error" });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const url = `http://localhost:${port}/?load=${encodeURIComponent(name ?? "")}`;
  console.log(`\n  ◆ kernic studio — ${url}`);
  console.log("  Editing locally. Ctrl+C to stop.\n");
  if (opts.open !== false) openBrowser(url);
}
