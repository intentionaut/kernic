import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import {
  buildGradients,
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
import { PREVIEW_COPY } from "./copy.ts";
import { LOOKS } from "./looks.ts";

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
  /** Exact primary seed (vibe click / load path). */
  primarySeed?: string;
  /** Seed supplying lightness/chroma character while the hue slider rotates it. */
  baseSeed?: string;
  /** Absolute target hue (0–360) applied over baseSeed. */
  targetHue?: number;
  /** Exact accent seed (vibe click / load path). */
  accentSeed?: string;
  harmony?: Harmony;
  neutralTintHue?: number | null;
  chromaScale?: number;
  lRange?: [number, number];
}

export function buildPalette(req: PaletteRequest) {
  const base = req.baseSeed ? hexToOklch(req.baseSeed) : null;
  const primarySeed =
    req.primarySeed ??
    (base
      ? oklchToHex({ l: base.l, c: base.c, h: (((req.targetHue ?? base.h) % 360) + 360) % 360 })
      : oklchToHex({ l: 0.6, c: 0.17, h: (((req.targetHue ?? 220) % 360) + 360) % 360 }));
  const accentSeed = req.accentSeed ?? harmonize(primarySeed, req.harmony ?? "analogous");
  const compress = { chromaScale: req.chromaScale, lRange: req.lRange };
  const colors = {
    primary: buildRamp(primarySeed, compress),
    accent: buildRamp(accentSeed, compress),
    neutral: buildNeutral(req.neutralTintHue ?? undefined),
  };
  return {
    seeds: {
      primarySeed,
      accentSeed,
      neutralTintHue: req.neutralTintHue ?? null,
      ...(req.chromaScale != null ? { chromaScale: req.chromaScale } : {}),
      ...(req.lRange ? { lRange: req.lRange } : {}),
    },
    colors,
    semantic: semanticFromRamps(colors, false),
    semanticDark: semanticFromRamps(colors, true),
    gradients: buildGradients(colors),
  };
}

/** Best-effort seed recovery when editing a system that has no stored seeds. */
export function deriveSeeds(ds: DesignSystem) {
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

export function vibePublic(v: Vibe) {
  const { id, label, description, radius, typeRatio, fonts, darkModeDefault, primarySeed, accentSeed, neutralTintHue, chromaScale, lRange } = v;
  return { id, label, description, radius, typeRatio, fonts, darkModeDefault, primarySeed, accentSeed, neutralTintHue, chromaScale, lRange };
}

function lookPreview(l: (typeof LOOKS)[number]) {
  const compress = { chromaScale: l.chromaScale ?? undefined, lRange: l.lRange ?? undefined };
  const colors = {
    primary: buildRamp(l.primarySeed, compress),
    accent: buildRamp(l.accentSeed, compress),
    neutral: buildNeutral(l.neutralTintHue ?? undefined),
  };
  return { ...l, colors, semantic: semanticFromRamps(colors, l.darkDefault), gradients: buildGradients(colors) };
}

export async function apiLooks(): Promise<{ looks: ReturnType<typeof lookPreview>[] }> {
  return { looks: LOOKS.map(lookPreview) };
}

export function apiMeta() {
  return {
    version: "0.1.0",
    vibes: VIBES.map(vibePublic),
    copy: PREVIEW_COPY,
    radii: RADIUS_PRESETS,
    ratios: [1.125, 1.2, 1.25, 1.333, 1.414, 1.618],
    spaces: [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16],
  };
}

export async function apiFonts(
  query: string,
  deps: { getFontCatalog: typeof getFontCatalog; searchFonts: typeof searchFonts } = { getFontCatalog, searchFonts }
): Promise<{ results: Awaited<ReturnType<typeof searchFonts>>; live: boolean }> {
  const { fonts, live } = await deps.getFontCatalog();
  return { results: await deps.searchFonts(fonts, query, 30), live };
}

export async function apiLoad(
  name: string,
  deps: { loadSystem: typeof loadSystem } = { loadSystem }
): Promise<{ status: 200 | 404; body: unknown }> {
  const ds = await deps.loadSystem(name);
  if (!ds) return { status: 404, body: { error: `Not found: ${name}` } };
  return { status: 200, body: { system: ds, seeds: deriveSeeds(ds) } };
}

export async function apiSave(
  body: unknown,
  deps: { saveSystem: typeof saveSystem } = { saveSystem }
): Promise<{ status: 200 | 400; body: unknown }> {
  const b = (body ?? {}) as DesignSystem & { extensions?: Record<string, unknown> };
  const name = normalizeName(b.name ?? "");
  if (!name) return { status: 400, body: { error: "Invalid system name" } };
  if (!b.colors?.primary || !b.fonts) return { status: 400, body: { error: "Malformed system" } };
  const ds: DesignSystem = {
    schemaVersion: 1,
    name,
    vibe: b.vibe ?? "custom",
    createdAt: new Date().toISOString(),
    colors: b.colors,
    semantic: b.semantic,
    fonts: b.fonts,
    radius: b.radius,
    typeScale: b.typeScale,
    gradients: typeof b.gradients === "object" && b.gradients !== null ? b.gradients : undefined,
    extensions: b.extensions,
  };
  await deps.saveSystem(ds);
  return { status: 200, body: { ok: true, name } };
}

export function apiRandom(deps: { randomSeed: typeof randomSeed } = { randomSeed }): { seed: string } {
  return { seed: deps.randomSeed() };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/looks") {
    return json(res, 200, await apiLooks()), true;
  }

  if (req.method === "GET" && path === "/api/meta") {
    return json(res, 200, apiMeta()), true;
  }

  if (req.method === "GET" && path.startsWith("/api/fonts")) {
    const q = url.searchParams.get("q") ?? "";
    return json(res, 200, await apiFonts(q)), true;
  }

  if (req.method === "POST" && path === "/api/palette") {
    return json(res, 200, buildPalette(await readBody(req))), true;
  }

  if (req.method === "GET" && path.startsWith("/api/load/")) {
    const name = decodeURIComponent(path.slice("/api/load/".length));
    const { status, body } = await apiLoad(name);
    return json(res, status, body), true;
  }

  if (req.method === "POST" && path === "/api/save") {
    const { status, body } = await apiSave(await readBody(req));
    return json(res, status, body), true;
  }

  if (req.method === "GET" && path === "/api/random") {
    return json(res, 200, apiRandom()), true;
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
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}

export function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {}
}

/**
 * Creates (but does not start listening on) the Studio HTTP server. Split
 * out from startStudio so tests can listen on an ephemeral port and hit it
 * with real requests, without also triggering openBrowser's real OS spawn.
 */
export function createStudioServer(): Server {
  return createServer(async (req, res) => {
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
}

export async function startStudio(name?: string, opts: { open?: boolean } = {}): Promise<void> {
  const server = createStudioServer();

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const url = `http://localhost:${port}/?load=${encodeURIComponent(name ?? "")}`;
  console.log(`\n  ◆ kernic studio — ${url}`);
  console.log("  Editing locally. Ctrl+C to stop.\n");
  if (opts.open !== false) openBrowser(url);
}
