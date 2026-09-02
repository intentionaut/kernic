import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve, sep } from "node:path";
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
import { getFontCatalog, rankFonts, type FontInfo } from "../fonts.ts";
import { loadSystem, normalizeName, saveSystem } from "../storage.ts";
import { MOTION_PRESET_IDS, buildMotion, buildShadows, easeCss, migrateSystem, shadowCss } from "../tokens.ts";
import { SHADOW_LEVELS, type DesignSystem, type DesignSystemV1, type MotionPreset, type MotionTokens, type Ramp, type ShadowTokens } from "../types.ts";
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

/**
 * Studio is a loopback-only app, so the threat model is other software and
 * other web pages on the same machine — not the internet. This policy keeps
 * the two things the client genuinely needs from Google (the css2 stylesheet
 * and the font files it references) and denies everything else, so injected
 * markup can't pull in a script or beacon a saved system anywhere.
 *
 * 'unsafe-inline' in style-src is required: the client renders inline `style`
 * attributes for live swatch/preview colors. Scripts stay on 'self' — there
 * are no inline <script> blocks in studio/index.html.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** Hostnames a loopback server may legitimately be addressed by. */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** 1 MB. Design systems are a few KB of JSON; nothing legitimate comes close. */
export const MAX_BODY_BYTES = 1024 * 1024;

/** An error whose message is safe to hand back to the client. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function splitHostPort(host: string): { hostname: string; port: string } | null {
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close < 0) return null;
    const rest = host.slice(close + 1);
    if (rest !== "" && !rest.startsWith(":")) return null;
    return { hostname: host.slice(0, close + 1), port: rest.slice(1) };
  }
  const colon = host.indexOf(":");
  if (colon < 0) return { hostname: host, port: "" };
  if (host.indexOf(":", colon + 1) >= 0) return null; // bare IPv6, not valid in a Host header
  return { hostname: host.slice(0, colon), port: host.slice(colon + 1) };
}

/**
 * Rejects DNS rebinding. Without this, any page the user visits can point a
 * hostname it controls at 127.0.0.1 and then read and write the user's design
 * systems through this server, because the browser treats it as same-origin
 * with the attacker's page. Only loopback names addressing *our* port pass.
 */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const parts = splitHostPort(host.trim().toLowerCase());
  if (!parts) return false;
  if (!LOOPBACK_HOSTNAMES.has(parts.hostname)) return false;
  return parts.port === "" ? port === 80 : parts.port === String(port);
}

/**
 * Rejects cross-site writes. POST /api/save writes a file into
 * ~/.config/kernic/systems/, so without an Origin check any page open in the
 * user's browser could scan for the port and then write files there. Browsers
 * always attach Origin to a fetch with a method other than GET/HEAD, so
 * requiring it to be present *and* ours is safe for the real client and fatal
 * for a cross-site one (which cannot forge the header).
 */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false; // includes the literal "null" origin from sandboxed contexts
  }
  if (parsed.protocol !== "http:") return false;
  if (!LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) return false;
  return parsed.port === "" ? port === 80 : parsed.port === String(port);
}

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requiresOriginCheck(method: string | undefined): boolean {
  return STATE_CHANGING.has((method ?? "").toUpperCase());
}

/** Ceiling on how much of an already-refused body we will read and throw away. */
const MAX_DISCARD_BYTES = MAX_BODY_BYTES * 8;

/**
 * Reads a JSON request body with a hard size cap, so a local process can't
 * make the server buffer unbounded memory. Once the cap is passed nothing
 * further is retained — but the rest is drained rather than the socket being
 * torn down, so the caller gets a clean 413 instead of a broken connection.
 * Malformed JSON becomes a 400, not a 500.
 */
export async function readBody(req: IncomingMessage): Promise<any> {
  const declared = Number(req.headers["content-length"]);
  let tooLarge = Number.isFinite(declared) && declared > MAX_BODY_BYTES;

  const chunks: Buffer[] = [];
  let size = 0;
  let discarded = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    if (tooLarge) {
      discarded += buf.length;
      // A sender that keeps going long past the refusal gets cut off.
      if (discarded > MAX_DISCARD_BYTES) {
        req.destroy();
        break;
      }
      continue;
    }
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      tooLarge = true;
      chunks.length = 0; // release what was buffered before the cap was hit
      continue;
    }
    chunks.push(buf);
  }

  if (tooLarge) throw new HttpError(413, "Request body too large");
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Malformed JSON body");
  }
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
  /** Motion preset for the preview's transitions; the vibe's, when known. */
  motion?: MotionPreset;
}

/** Shadows and motion as CSS strings, for the preview to drop into variables. */
export function previewExtras(shadows: ShadowTokens, motion: MotionTokens) {
  const css = (mode: "light" | "dark") =>
    Object.fromEntries(SHADOW_LEVELS.map((l) => [l, shadowCss(shadows[l][mode])]));
  return {
    shadows: { light: css("light"), dark: css("dark") },
    motion: {
      duration: { ...motion.duration },
      ease: { out: easeCss(motion.ease.out), inOut: easeCss(motion.ease.inOut), emphasized: easeCss(motion.ease.emphasized) },
    },
  };
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
    ...previewExtras(
      buildShadows(colors.neutral),
      buildMotion(MOTION_PRESET_IDS.includes(req.motion as MotionPreset) ? (req.motion as MotionPreset) : "brisk")
    ),
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

export const FONT_LIMIT_DEFAULT = 30;
/** Nothing may request the whole ~2000-entry catalog in one response. */
export const FONT_LIMIT_MAX = 200;

export function clampFontLimit(limit: number): number {
  if (!Number.isFinite(limit)) return FONT_LIMIT_DEFAULT;
  const n = Math.floor(limit);
  if (n < 1) return FONT_LIMIT_DEFAULT;
  return Math.min(n, FONT_LIMIT_MAX);
}

/** `?limit=` parsing: non-numeric, empty, zero and negative all fall back to the default. */
export function parseFontLimit(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === "") return FONT_LIMIT_DEFAULT;
  return clampFontLimit(Number(raw));
}

export async function apiFonts(
  query: string,
  limit: number = FONT_LIMIT_DEFAULT,
  deps: { getFontCatalog: typeof getFontCatalog; rankFonts: typeof rankFonts } = { getFontCatalog, rankFonts }
): Promise<{ results: FontInfo[]; live: boolean; total: number }> {
  const { fonts, live } = await deps.getFontCatalog();
  const ranked = deps.rankFonts(fonts, query ?? "");
  // total is the pre-truncation match count, so the client can say
  // "showing 30 of 412" instead of pretending 30 is all there is.
  return { results: ranked.slice(0, clampFontLimit(limit)), live, total: ranked.length };
}

export async function apiLoad(
  name: string,
  deps: { loadSystem: typeof loadSystem } = { loadSystem }
): Promise<{ status: 200 | 404; body: unknown }> {
  const ds = await deps.loadSystem(name);
  if (!ds) return { status: 404, body: { error: `Not found: ${name}` } };
  return { status: 200, body: { system: ds, seeds: deriveSeeds(ds), preview: previewExtras(ds.shadows, ds.motion) } };
}

/* ---------- POST /api/save validation ----------
 * Everything here ends up on disk in ~/.config/kernic/systems/ and is later
 * interpolated into exported CSS, Tailwind and HTML. So each persisted field
 * is checked for type, shape and size, and any value that lands in CSS is
 * restricted to a character set that cannot close a declaration or a string
 * and start something else.
 */

const MAX_RAW_NAME_LENGTH = 200;
const MAX_ID_LENGTH = 64;
const MAX_FONT_FAMILY_LENGTH = 64;
const MAX_RAMP_ENTRIES = 32;
const MAX_CSS_VALUE_LENGTH = 64;
const MAX_GRADIENTS = 32;
const MAX_GRADIENT_LENGTH = 256;
const MAX_SEMANTIC_KEYS = 32;
const MAX_EXTENSIONS_BYTES = 64 * 1024;

/** Hex, rgb()/oklch() and the like — no quote, semicolon, brace or angle bracket. */
const SAFE_CSS_VALUE = /^[A-Za-z0-9#(),.%/\s_-]+$/;
/** Font families are wrapped in quotes in exported CSS and put into a Google Fonts URL. */
const SAFE_FONT_FAMILY = /^[\p{L}\p{N}][\p{L}\p{N} .+&_-]*$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;
const SAFE_KEY = /^[A-Za-z0-9-]{1,16}$/;
const RADIUS_STYLES = new Set(["sharp", "soft", "round", "pill"]);

class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cssValue(v: unknown, where: string, max = MAX_CSS_VALUE_LENGTH): string {
  if (typeof v !== "string" || v.length === 0 || v.length > max) fail(`Invalid ${where}`);
  if (!SAFE_CSS_VALUE.test(v as string)) fail(`Invalid ${where}`);
  return v as string;
}

function ramp(v: unknown, where: string): Ramp {
  if (!isPlainObject(v)) fail(`Invalid ${where}`);
  const keys = Object.keys(v);
  if (keys.length === 0 || keys.length > MAX_RAMP_ENTRIES) fail(`Invalid ${where}`);
  for (const k of keys) {
    if (!SAFE_KEY.test(k)) fail(`Invalid ${where} stop`);
    cssValue(v[k], `${where} stop ${k}`);
  }
  return v as Ramp;
}

function fontFamily(v: unknown, where: string): string {
  if (typeof v !== "string") fail(`Invalid ${where} font`);
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > MAX_FONT_FAMILY_LENGTH || !SAFE_FONT_FAMILY.test(trimmed)) {
    fail(`Invalid ${where} font`);
  }
  return trimmed;
}

function boundedNumber(v: unknown, where: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail(`Invalid ${where}`);
  return v as number;
}

/** Semantic colors are either a flat string or a { light, dark } pair. */
function semanticValue(v: unknown, where: string): unknown {
  if (typeof v === "string") return cssValue(v, where);
  if (isPlainObject(v)) {
    for (const mode of ["light", "dark"]) {
      if (!(mode in v)) fail(`Invalid ${where}`);
      cssValue(v[mode], `${where}.${mode}`);
    }
    return v;
  }
  return fail(`Invalid ${where}`);
}

/**
 * Validates the request body and returns exactly the fields that get
 * persisted. Anything not named here is dropped rather than trusted.
 */
export function validateSystemBody(body: unknown): DesignSystem {
  if (!isPlainObject(body)) fail("Malformed system");

  const rawName = body.name;
  if (typeof rawName !== "string" || rawName.length > MAX_RAW_NAME_LENGTH) fail("Invalid system name");
  // normalizeName slugifies to [a-z0-9-], which is what makes the filename
  // safe. Every other write path (kernic new, the wizard) normalizes before
  // calling saveSystem too, so no caller can steer the path with a name.
  const name = normalizeName(rawName);
  if (!name) fail("Invalid system name");

  const colors = body.colors;
  if (!isPlainObject(colors)) fail("Malformed system");
  const validColors = {
    primary: ramp(colors.primary, "primary ramp"),
    accent: ramp(colors.accent, "accent ramp"),
    neutral: ramp(colors.neutral, "neutral ramp"),
  };

  const fonts = body.fonts;
  if (!isPlainObject(fonts)) fail("Malformed system");
  const validFonts = {
    heading: fontFamily(fonts.heading, "heading"),
    body: fontFamily(fonts.body, "body"),
    mono: fontFamily(fonts.mono, "mono"),
  };

  const radius = body.radius;
  if (!isPlainObject(radius)) fail("Malformed system");
  if (typeof radius.style !== "string" || !RADIUS_STYLES.has(radius.style)) fail("Invalid radius style");
  const validRadius = {
    style: radius.style as DesignSystem["radius"]["style"],
    sm: cssValue(radius.sm, "radius.sm", 32),
    md: cssValue(radius.md, "radius.md", 32),
    lg: cssValue(radius.lg, "radius.lg", 32),
    xl: cssValue(radius.xl, "radius.xl", 32),
  };

  const typeScale = body.typeScale;
  if (!isPlainObject(typeScale)) fail("Malformed system");
  const validTypeScale = {
    ratio: boundedNumber(typeScale.ratio, "type ratio", 1, 4),
    baseRem: boundedNumber(typeScale.baseRem, "base size", 0.25, 8),
  };

  let vibe = "custom";
  if (body.vibe != null) {
    if (typeof body.vibe !== "string" || body.vibe.length > MAX_ID_LENGTH || !SAFE_ID.test(body.vibe)) {
      fail("Invalid vibe");
    }
    vibe = body.vibe;
  }

  // Optional today, as it always has been — but checked when present rather
  // than written through unread.
  let semantic: DesignSystem["semantic"] | undefined;
  if (body.semantic != null) {
    if (!isPlainObject(body.semantic)) fail("Invalid semantic colors");
    const keys = Object.keys(body.semantic);
    if (keys.length > MAX_SEMANTIC_KEYS) fail("Invalid semantic colors");
    for (const k of keys) {
      if (!SAFE_KEY.test(k)) fail("Invalid semantic key");
      semanticValue(body.semantic[k], `semantic.${k}`);
    }
    semantic = body.semantic as unknown as DesignSystem["semantic"];
  }

  let gradients: Record<string, string> | undefined;
  if (body.gradients != null) {
    if (!isPlainObject(body.gradients)) fail("Invalid gradients");
    const keys = Object.keys(body.gradients);
    if (keys.length > MAX_GRADIENTS) fail("Invalid gradients");
    for (const k of keys) {
      if (!SAFE_KEY.test(k)) fail("Invalid gradient key");
      cssValue(body.gradients[k], `gradient ${k}`, MAX_GRADIENT_LENGTH);
    }
    gradients = body.gradients as Record<string, string>;
  }

  // extensions is the documented forward-compat escape hatch, so its contents
  // stay opaque — but it must be an object, must not carry a prototype key,
  // and must be small enough that a save can't write an arbitrary blob.
  let extensions: Record<string, unknown> | undefined;
  if (body.extensions != null) {
    if (!isPlainObject(body.extensions)) fail("Invalid extensions");
    if (Object.prototype.hasOwnProperty.call(body.extensions, "__proto__")) fail("Invalid extensions");
    let serialized: string;
    try {
      serialized = JSON.stringify(body.extensions) ?? "";
    } catch {
      return fail("Invalid extensions");
    }
    if (Buffer.byteLength(serialized, "utf8") > MAX_EXTENSIONS_BYTES) fail("Extensions too large");
    extensions = body.extensions;
  }

  // Studio edits the version-1 surface (ramps, fonts, radius, scale); the
  // version-2 token groups are derived from those, the same way a build does.
  const v1: DesignSystemV1 = {
    name,
    vibe,
    createdAt: new Date().toISOString(),
    colors: validColors,
    semantic: semantic as DesignSystem["semantic"],
    fonts: validFonts,
    radius: validRadius,
    typeScale: validTypeScale,
    gradients,
    extensions,
  };
  return migrateSystem(v1);
}

export async function apiSave(
  body: unknown,
  deps: { saveSystem: typeof saveSystem } = { saveSystem }
): Promise<{ status: 200 | 400; body: unknown }> {
  let ds: DesignSystem;
  try {
    ds = validateSystemBody(body);
  } catch (err) {
    if (err instanceof ValidationError) return { status: 400, body: { error: err.message } };
    throw err;
  }
  await deps.saveSystem(ds);
  return { status: 200, body: { ok: true, name: ds.name } };
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
    const limit = parseFontLimit(url.searchParams.get("limit"));
    return json(res, 200, await apiFonts(q, limit)), true;
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

/**
 * Maps a request path to a real file inside the studio directory, or null.
 *
 * The old implementation stripped leading "../" segments with a regex, which
 * missed embedded traversal, backslash separators on Windows, and
 * percent-encoded dots. This resolves the candidate and then proves it is
 * genuinely under the root — the only check that is not a blocklist.
 */
export function resolveStaticPath(pathname: string, root: string = STUDIO_DIR): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes("\0")) return null;

  const rel = decoded === "" || decoded === "/" ? "index.html" : decoded.replace(/^[/\\]+/, "");
  if (rel === "") return null;

  const rootPath = resolve(root);
  const candidate = resolve(rootPath, rel);
  if (candidate !== rootPath && !candidate.startsWith(rootPath + sep)) return null;
  if (candidate === rootPath) return null; // the directory itself is not a file
  return candidate;
}

async function serveStatic(res: ServerResponse, url: URL): Promise<void> {
  const file = resolveStaticPath(url.pathname);
  if (file === null) return notFound(res);
  try {
    const st = await stat(file);
    if (!st.isFile()) return notFound(res);
    const base = basename(file);
    const dot = base.lastIndexOf(".");
    const ext = dot >= 0 ? base.slice(dot).toLowerCase() : "";
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    });
    res.end(await readFile(file));
  } catch {
    notFound(res);
  }
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain", ...SECURITY_HEADERS });
  res.end("not found");
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
    // The port we are actually listening on, rather than anything the caller
    // claims — both guards below compare against this.
    const port = req.socket.localPort ?? 0;
    try {
      if (!isAllowedHost(req.headers.host, port)) {
        return json(res, 403, { error: "Forbidden host" });
      }
      if (requiresOriginCheck(req.method) && !isAllowedOrigin(req.headers.origin, port)) {
        return json(res, 403, { error: "Forbidden origin" });
      }

      if (url.pathname.startsWith("/api/")) {
        const handled = await handleApi(req, res, url);
        if (!handled) json(res, 404, { error: "Unknown endpoint" });
        return;
      }
      await serveStatic(res, url);
    } catch (err: unknown) {
      // Only messages we wrote ourselves go back to the client. A raw
      // err.message here would happily hand over filesystem paths from an
      // fs error, or internals from a stack-carrying exception.
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) {
        json(res, err.status, { error: err.message });
        return;
      }
      console.error("[kernic studio] request failed:", err);
      json(res, 500, { error: "Server error" });
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
