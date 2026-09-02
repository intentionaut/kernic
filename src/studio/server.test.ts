import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { Readable } from "node:stream";
import { request as httpRequest, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.spyOn can't patch a live ESM named-import binding for a Node builtin
// ("Module namespace is not configurable in ESM"), so openBrowser's spawn
// call is covered via a full module mock instead. Hoisted by Vitest to the
// top of the file regardless of this position.
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "node:child_process";
const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

// The global fetch guard in src/test/setup.ts exists to stop tests from
// silently reaching the real network — it's not meant to block the loopback
// calls the integration tests below make against their own ephemeral server.
const realFetch = globalThis.fetch;

import {
  FONT_LIMIT_DEFAULT,
  FONT_LIMIT_MAX,
  HttpError,
  MAX_BODY_BYTES,
  apiFonts,
  apiLoad,
  apiLooks,
  apiMeta,
  apiRandom,
  apiSave,
  buildPalette,
  clampFontLimit,
  createStudioServer,
  deriveSeeds,
  isAllowedHost,
  isAllowedOrigin,
  openBrowser,
  parseFontLimit,
  readBody,
  requiresOriginCheck,
  resolveStaticPath,
  validateSystemBody,
  vibePublic,
} from "./server.ts";
import { hexToOklch } from "../color.ts";
import { getVibe, VIBES } from "../vibes.ts";
import { saveSystem } from "../storage.ts";
import { FIXTURE_VIBE_DS } from "../test/fixtures.ts";

describe("buildPalette", () => {
  it("derives a primary seed from a base seed rotated to the target hue", () => {
    const result = buildPalette({ baseSeed: "#3366cc", targetHue: 90 });
    expect(hexToOklch(result.seeds.primarySeed).h).toBeCloseTo(90, 0);
  });

  it("wraps a negative target hue into 0-360 range even with no baseSeed (regression for the line-67 operator-precedence bug)", () => {
    const result = buildPalette({ targetHue: -30 });
    const h = hexToOklch(result.seeds.primarySeed).h;
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(h).toBeCloseTo(330, 0); // -30 mod 360 == 330
  });

  it("defaults to hue 220 with no baseSeed and no targetHue", () => {
    const result = buildPalette({});
    expect(hexToOklch(result.seeds.primarySeed).h).toBeCloseTo(220, 0);
  });

  it("uses exact seeds when given, deriving the accent via harmonize otherwise", () => {
    const result = buildPalette({ primarySeed: "#112233", harmony: "triadic" });
    expect(result.seeds.primarySeed).toBe("#112233");
    expect(result.colors.primary["500"]).toBeDefined();
  });

  it("includes both light and dark semantic sets and gradients", () => {
    const result = buildPalette({ primarySeed: "#3366cc" });
    expect(result.semantic).toBeDefined();
    expect(result.semanticDark).toBeDefined();
    expect(result.gradients.primary).toContain("linear-gradient");
  });
});

describe("deriveSeeds", () => {
  it("returns stored seeds from extensions when present", () => {
    const ds = { ...FIXTURE_VIBE_DS, extensions: { seeds: { primarySeed: "#abcdef" } } };
    expect(deriveSeeds(ds).primarySeed).toBe("#abcdef");
  });

  it("falls back to deriving seeds from the color ramps when no extensions exist", () => {
    const result = deriveSeeds(FIXTURE_VIBE_DS);
    expect(result.primarySeed).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result.accentSeed).toBe(FIXTURE_VIBE_DS.colors.accent["500"]);
  });
});

describe("vibePublic", () => {
  it("exposes only the documented public fields", () => {
    const pub = vibePublic(getVibe("tech")!);
    expect(Object.keys(pub).sort()).toEqual(
      ["id", "label", "description", "radius", "typeRatio", "fonts", "darkModeDefault", "primarySeed", "accentSeed", "neutralTintHue", "chromaScale", "lRange"].sort()
    );
  });
});

describe("apiLooks", () => {
  it("returns exactly one preview per LOOKS entry, each with rendered colors", async () => {
    const { looks } = await apiLooks();
    expect(looks.length).toBe(33);
    expect(looks[0].colors.primary["500"]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("apiMeta", () => {
  it("includes all 8 vibes in public shape and the fixed ratio/space lists", () => {
    const meta = apiMeta();
    expect(meta.vibes.length).toBe(VIBES.length);
    expect(meta.ratios).toContain(1.25);
    expect(meta.spaces).toContain(16);
  });
});

describe("apiFonts", () => {
  const catalog = [{ family: "Foo", category: "sans-serif" }];
  const deps = (matches = catalog, live = true) => ({
    getFontCatalog: vi.fn(async () => ({ fonts: catalog, live })),
    rankFonts: vi.fn(() => matches),
  });

  it("delegates to the injected getFontCatalog/rankFonts", async () => {
    const d = deps();
    const result = await apiFonts("fo", 30, d);
    expect(d.getFontCatalog).toHaveBeenCalledOnce();
    expect(d.rankFonts).toHaveBeenCalledWith(catalog, "fo");
    expect(result.live).toBe(true);
    expect(result.results).toEqual(catalog);
  });

  it("reports the pre-truncation match count as total", async () => {
    const many = Array.from({ length: 412 }, (_, i) => ({ family: `Font ${i}`, category: "serif" }));
    const result = await apiFonts("font", 30, deps(many));
    expect(result.results.length).toBe(30);
    expect(result.total).toBe(412); // lets the client say "showing 30 of 412"
  });

  it("honours an explicit limit", async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ family: `Font ${i}`, category: "serif" }));
    expect((await apiFonts("font", 5, deps(many))).results.length).toBe(5);
  });

  it("clamps a limit above the maximum so no caller can pull the whole catalog", async () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ family: `Font ${i}`, category: "serif" }));
    const result = await apiFonts("font", 99999, deps(many));
    expect(result.results.length).toBe(FONT_LIMIT_MAX);
    expect(result.total).toBe(2000);
  });

  it("passes the offline flag through untouched", async () => {
    expect((await apiFonts("fo", 30, deps(catalog, false))).live).toBe(false);
  });
});

describe("parseFontLimit / clampFontLimit", () => {
  it("defaults when the parameter is missing or blank", () => {
    expect(parseFontLimit(null)).toBe(FONT_LIMIT_DEFAULT);
    expect(parseFontLimit("")).toBe(FONT_LIMIT_DEFAULT);
    expect(parseFontLimit("   ")).toBe(FONT_LIMIT_DEFAULT);
  });

  it("defaults on non-numeric, zero and negative input rather than trusting it", () => {
    expect(parseFontLimit("abc")).toBe(FONT_LIMIT_DEFAULT);
    expect(parseFontLimit("NaN")).toBe(FONT_LIMIT_DEFAULT);
    expect(parseFontLimit("0")).toBe(FONT_LIMIT_DEFAULT);
    expect(parseFontLimit("-5")).toBe(FONT_LIMIT_DEFAULT);
    expect(parseFontLimit("-Infinity")).toBe(FONT_LIMIT_DEFAULT);
  });

  it("accepts a sane explicit limit and floors fractional values", () => {
    expect(parseFontLimit("12")).toBe(12);
    expect(parseFontLimit("12.9")).toBe(12);
  });

  it("clamps anything oversized down to the maximum", () => {
    expect(parseFontLimit("100000")).toBe(FONT_LIMIT_MAX);
    expect(parseFontLimit("Infinity")).toBe(FONT_LIMIT_DEFAULT);
    expect(clampFontLimit(Number.NaN)).toBe(FONT_LIMIT_DEFAULT);
    expect(clampFontLimit(FONT_LIMIT_MAX + 1)).toBe(FONT_LIMIT_MAX);
  });
});

describe("isAllowedHost (DNS rebinding guard)", () => {
  it("accepts loopback names addressing our own port", () => {
    expect(isAllowedHost("localhost:4321", 4321)).toBe(true);
    expect(isAllowedHost("127.0.0.1:4321", 4321)).toBe(true);
    expect(isAllowedHost("LOCALHOST:4321", 4321)).toBe(true);
    expect(isAllowedHost("[::1]:4321", 4321)).toBe(true);
  });

  it("rejects an attacker-controlled hostname resolved to 127.0.0.1", () => {
    expect(isAllowedHost("evil.example.com:4321", 4321)).toBe(false);
    expect(isAllowedHost("kernic.attacker.test:4321", 4321)).toBe(false);
    expect(isAllowedHost("localhost.evil.com:4321", 4321)).toBe(false);
  });

  it("rejects a missing, malformed or wrong-port Host header", () => {
    expect(isAllowedHost(undefined, 4321)).toBe(false);
    expect(isAllowedHost("", 4321)).toBe(false);
    expect(isAllowedHost("localhost:9999", 4321)).toBe(false);
    expect(isAllowedHost("localhost", 4321)).toBe(false);
    expect(isAllowedHost("[::1", 4321)).toBe(false);
    expect(isAllowedHost("::1", 4321)).toBe(false); // unbracketed IPv6 isn't a valid Host
  });

  it("allows a port-less loopback Host only on port 80", () => {
    expect(isAllowedHost("localhost", 80)).toBe(true);
    expect(isAllowedHost("[::1]", 80)).toBe(true);
  });
});

describe("isAllowedOrigin (CSRF guard)", () => {
  it("accepts our own origin in either loopback spelling", () => {
    expect(isAllowedOrigin("http://localhost:4321", 4321)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4321", 4321)).toBe(true);
  });

  it("rejects any other site, the null origin, and a mismatched port", () => {
    expect(isAllowedOrigin("https://evil.example.com", 4321)).toBe(false);
    expect(isAllowedOrigin("http://evil.example.com:4321", 4321)).toBe(false);
    expect(isAllowedOrigin("null", 4321)).toBe(false);
    expect(isAllowedOrigin("http://localhost:9999", 4321)).toBe(false);
    expect(isAllowedOrigin("not a url", 4321)).toBe(false);
    expect(isAllowedOrigin(undefined, 4321)).toBe(false);
  });

  it("only guards state-changing methods", () => {
    expect(requiresOriginCheck("POST")).toBe(true);
    expect(requiresOriginCheck("post")).toBe(true);
    expect(requiresOriginCheck("DELETE")).toBe(true);
    expect(requiresOriginCheck("GET")).toBe(false);
    expect(requiresOriginCheck(undefined)).toBe(false);
  });
});

describe("resolveStaticPath (traversal guard)", () => {
  const root = "/srv/studio";

  it("maps / to index.html and resolves ordinary assets", () => {
    expect(resolveStaticPath("/", root)).toBe(join(root, "index.html"));
    expect(resolveStaticPath("/app.js", root)).toBe(join(root, "app.js"));
  });

  it("rejects forward-slash traversal, including embedded and encoded segments", () => {
    expect(resolveStaticPath("/../../../etc/passwd", root)).toBe(null);
    expect(resolveStaticPath("/assets/../../../../etc/passwd", root)).toBe(null);
    expect(resolveStaticPath("/..%2f..%2f..%2fetc%2fpasswd", root)).toBe(null);
    expect(resolveStaticPath("/%2e%2e/%2e%2e/etc/passwd", root)).toBe(null);
  });

  it("does not escape via backslash separators", () => {
    // On Windows these are real separators; on POSIX they are literal filename
    // characters. Either way the result must stay under the root.
    const back = resolveStaticPath("\\..\\..\\etc\\passwd", root);
    expect(back === null || back.startsWith(root + sep)).toBe(true);
    const mixed = resolveStaticPath("/..\\..\\etc\\passwd", root);
    expect(mixed === null || mixed.startsWith(root + sep)).toBe(true);
  });

  it("rejects null bytes, bad encoding and the root directory itself", () => {
    expect(resolveStaticPath("/app.js\0.png", root)).toBe(null);
    expect(resolveStaticPath("/%E0%A4%A", root)).toBe(null);
    expect(resolveStaticPath("//", root)).toBe(null);
  });

  it("rejects a sibling directory that merely shares the root's prefix", () => {
    expect(resolveStaticPath("/../studio-secrets/key.txt", root)).toBe(null);
  });
});

describe("apiLoad", () => {
  it("returns 404 with an error message when the system isn't found", async () => {
    const loadSystem = vi.fn(async () => null);
    const result = await apiLoad("missing", { loadSystem });
    expect(result.status).toBe(404);
    expect((result.body as { error: string }).error).toContain("missing");
  });

  it("returns 200 with the system and derived seeds when found", async () => {
    const loadSystem = vi.fn(async () => FIXTURE_VIBE_DS);
    const result = await apiLoad("acme-tech", { loadSystem });
    expect(result.status).toBe(200);
    expect((result.body as any).system).toEqual(FIXTURE_VIBE_DS);
    expect((result.body as any).seeds).toBeDefined();
  });
});

describe("apiSave", () => {
  it("returns 400 for an invalid (unnormalizable) name", async () => {
    const saveSystem = vi.fn();
    const result = await apiSave({ name: "   " }, { saveSystem });
    expect(result.status).toBe(400);
    expect(saveSystem).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed system missing colors/fonts", async () => {
    const saveSystem = vi.fn();
    const result = await apiSave({ name: "ok-name" }, { saveSystem });
    expect(result.status).toBe(400);
    expect(saveSystem).not.toHaveBeenCalled();
  });

  it("normalizes the name, stamps schemaVersion 2, and saves on success", async () => {
    const saveSystem = vi.fn();
    const result = await apiSave(
      { name: "My Brand!!", colors: FIXTURE_VIBE_DS.colors, fonts: FIXTURE_VIBE_DS.fonts, semantic: FIXTURE_VIBE_DS.semantic, radius: FIXTURE_VIBE_DS.radius, typeScale: FIXTURE_VIBE_DS.typeScale },
      { saveSystem }
    );
    expect(result.status).toBe(200);
    expect((result.body as any).name).toBe("my-brand");
    expect(saveSystem).toHaveBeenCalledOnce();
    expect(saveSystem.mock.calls[0][0].schemaVersion).toBe(2);
    expect(saveSystem.mock.calls[0][0].shadows).toBeDefined();
  });
});

describe("validateSystemBody", () => {
  const valid = () => ({
    name: "valid-system",
    vibe: "tech",
    colors: FIXTURE_VIBE_DS.colors,
    semantic: FIXTURE_VIBE_DS.semantic,
    fonts: FIXTURE_VIBE_DS.fonts,
    radius: FIXTURE_VIBE_DS.radius,
    typeScale: FIXTURE_VIBE_DS.typeScale,
    gradients: FIXTURE_VIBE_DS.gradients,
  });

  it("accepts a realistic system produced by the client", () => {
    const ds = validateSystemBody(valid());
    expect(ds.name).toBe("valid-system");
    expect(ds.schemaVersion).toBe(2);
    expect(ds.motion.preset).toBe("brisk");
    expect(ds.fonts).toEqual(FIXTURE_VIBE_DS.fonts);
  });

  it("keeps only the fields it persists, dropping anything else in the body", () => {
    const ds = validateSystemBody({ ...valid(), sneaky: "value", __proto__: { polluted: true } }) as any;
    expect(ds.sneaky).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });

  it.each([
    ["a non-object body", "not an object"],
    ["a null body", null],
    ["a missing name", { ...valid(), name: undefined }],
    ["a non-string name", { ...valid(), name: 42 }],
    ["an unnormalizable name", { ...valid(), name: "!!!" }],
    ["an over-long name", { ...valid(), name: "a".repeat(500) }],
    ["missing colors", { ...valid(), colors: undefined }],
    ["a missing ramp", { ...valid(), colors: { primary: FIXTURE_VIBE_DS.colors.primary } }],
    ["an array as a ramp", { ...valid(), colors: { ...FIXTURE_VIBE_DS.colors, accent: ["#fff"] } }],
    ["a non-string ramp value", { ...valid(), colors: { ...FIXTURE_VIBE_DS.colors, accent: { "500": 5 } } }],
    ["missing fonts", { ...valid(), fonts: undefined }],
    ["a missing radius", { ...valid(), radius: undefined }],
    ["an unknown radius style", { ...valid(), radius: { ...FIXTURE_VIBE_DS.radius, style: "wobbly" } }],
    ["a missing typeScale", { ...valid(), typeScale: undefined }],
    ["a non-numeric ratio", { ...valid(), typeScale: { ratio: "1.25", baseRem: 1 } }],
    ["an out-of-range ratio", { ...valid(), typeScale: { ratio: 1e9, baseRem: 1 } }],
    ["a NaN base size", { ...valid(), typeScale: { ratio: 1.25, baseRem: Number.NaN } }],
  ] as [string, unknown][])("rejects %s", (_label, body) => {
    expect(() => validateSystemBody(body)).toThrow();
  });

  it("rejects a color value that could break out of an exported CSS declaration", () => {
    const attack = { ...valid(), colors: { ...FIXTURE_VIBE_DS.colors, primary: { "500": "#fff; --x: url(http://evil.test)" } } };
    expect(() => validateSystemBody(attack)).toThrow(/primary ramp/);
  });

  it("rejects a font family that could break out of the exported quotes or @import URL", () => {
    for (const family of ['Inter", sans-serif; }@import url(http://evil.test); h1 {', "Inter'); }", "Inter<script>"]) {
      expect(() => validateSystemBody({ ...valid(), fonts: { ...FIXTURE_VIBE_DS.fonts, heading: family } })).toThrow(
        /heading font/
      );
    }
  });

  it("bounds the length of a font family", () => {
    expect(() => validateSystemBody({ ...valid(), fonts: { ...FIXTURE_VIBE_DS.fonts, body: "F".repeat(200) } })).toThrow();
  });

  it("accepts real Google families with digits, spaces and punctuation", () => {
    for (const family of ["Baloo 2", "Source Sans 3", "PT Serif", "M PLUS 1p", "IBM Plex Mono"]) {
      expect(validateSystemBody({ ...valid(), fonts: { ...FIXTURE_VIBE_DS.fonts, heading: family } }).fonts.heading).toBe(
        family
      );
    }
  });

  it("bounds the number of ramp stops", () => {
    const huge: Record<string, string> = {};
    for (let i = 0; i < 100; i++) huge[`s${i}`] = "#ffffff";
    expect(() => validateSystemBody({ ...valid(), colors: { ...FIXTURE_VIBE_DS.colors, neutral: huge } })).toThrow();
  });

  it("validates semantic colors when present but keeps them optional", () => {
    expect(validateSystemBody({ ...valid(), semantic: undefined }).semantic).toBeUndefined();
    expect(() => validateSystemBody({ ...valid(), semantic: { text: { light: "#000" } } })).toThrow(/semantic/);
    expect(() => validateSystemBody({ ...valid(), semantic: { text: { light: "#000", dark: "}#fff" } } })).toThrow();
  });

  it("validates gradients as bounded CSS values", () => {
    const ds = validateSystemBody({ ...valid(), gradients: { primary: "linear-gradient(135deg, #aaa 0%, #bbb 100%)" } });
    expect(ds.gradients?.primary).toContain("linear-gradient");
    expect(() => validateSystemBody({ ...valid(), gradients: { primary: "url(http://evil.test); x: y" } })).toThrow();
    expect(() => validateSystemBody({ ...valid(), gradients: { primary: "a".repeat(500) } })).toThrow();
    expect(() => validateSystemBody({ ...valid(), gradients: "not an object" })).toThrow();
  });

  it("keeps extensions opaque but bounded", () => {
    const ds = validateSystemBody({ ...valid(), extensions: { seeds: { primarySeed: "#3366cc" } } });
    expect((ds.extensions as any).seeds.primarySeed).toBe("#3366cc");
    expect(() => validateSystemBody({ ...valid(), extensions: "nope" })).toThrow();
    expect(() => validateSystemBody({ ...valid(), extensions: { blob: "x".repeat(200_000) } })).toThrow(/too large/i);
  });

  it("defaults the vibe and rejects a malformed one", () => {
    expect(validateSystemBody({ ...valid(), vibe: undefined }).vibe).toBe("custom");
    expect(() => validateSystemBody({ ...valid(), vibe: "../../etc/passwd" })).toThrow(/vibe/);
  });

  it("produces a name that is always safe as a filename", () => {
    for (const raw of ["../../etc/passwd", "..\\..\\win.ini", "a/b/c", "My Brand!!"]) {
      const name = validateSystemBody({ ...valid(), name: raw }).name;
      expect(name).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("readBody", () => {
  function fakeReq(chunks: Buffer[], headers: Record<string, string> = {}): IncomingMessage {
    const stream = Readable.from(chunks) as unknown as IncomingMessage;
    (stream as any).headers = headers;
    return stream;
  }

  it("returns {} for an empty body", async () => {
    expect(await readBody(fakeReq([]))).toEqual({});
  });

  it("parses a JSON body", async () => {
    expect(await readBody(fakeReq([Buffer.from('{"a":1}')]))).toEqual({ a: 1 });
  });

  it("turns malformed JSON into a clean 400, not a 500", async () => {
    await expect(readBody(fakeReq([Buffer.from("{not json")]))).rejects.toMatchObject({ status: 400 });
    await expect(readBody(fakeReq([Buffer.from("{not json")]))).rejects.toBeInstanceOf(HttpError);
  });

  it("refuses a body that streams past the cap", async () => {
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    const chunks = Array.from({ length: Math.ceil(MAX_BODY_BYTES / chunk.length) + 2 }, () => chunk);
    await expect(readBody(fakeReq(chunks))).rejects.toMatchObject({ status: 413 });
  });

  it("refuses an oversized declared Content-Length without buffering the body", async () => {
    const stream = fakeReq([Buffer.from('{"a":1}')], { "content-length": String(MAX_BODY_BYTES + 1) });
    await expect(readBody(stream)).rejects.toMatchObject({ status: 413 });
  });

  it("cuts off a sender that keeps streaming long after the refusal", async () => {
    const chunk = Buffer.alloc(1024 * 1024, 0x61);
    const stream = fakeReq(Array.from({ length: 32 }, () => chunk));
    const destroy = vi.spyOn(stream, "destroy");
    await expect(readBody(stream)).rejects.toMatchObject({ status: 413 });
    expect(destroy).toHaveBeenCalled();
  });
});

describe("apiRandom", () => {
  it("delegates to the injected randomSeed", () => {
    const randomSeed = vi.fn(() => "#abcdef");
    expect(apiRandom({ randomSeed })).toEqual({ seed: "#abcdef" });
  });
});

describe("createStudioServer (integration, real ephemeral server)", () => {
  let dir: string;
  let server: ReturnType<typeof createStudioServer>;
  let base: string;

  beforeEach(async () => {
    vi.stubGlobal("fetch", realFetch);
    dir = await mkdtemp(join(tmpdir(), "kernic-server-test-"));
    process.env.KERNIC_HOME_DIR = dir;
    server = createStudioServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.KERNIC_HOME_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("serves /api/meta over real HTTP", async () => {
    const res = await fetch(`${base}/api/meta`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vibes.length).toBe(VIBES.length);
  });

  it("returns 404 with a JSON error for an unknown /api/* route", async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeDefined();
  });

  it("round-trips save then load over real HTTP against the isolated temp home", async () => {
    const saveRes = await fetch(`${base}/api/save`, {
      method: "POST",
      // Same-origin header a browser attaches automatically to any non-GET fetch.
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({
        name: "http-roundtrip",
        colors: FIXTURE_VIBE_DS.colors,
        fonts: FIXTURE_VIBE_DS.fonts,
        semantic: FIXTURE_VIBE_DS.semantic,
        radius: FIXTURE_VIBE_DS.radius,
        typeScale: FIXTURE_VIBE_DS.typeScale,
      }),
    });
    expect(saveRes.status).toBe(200);

    const loadRes = await fetch(`${base}/api/load/http-roundtrip`);
    expect(loadRes.status).toBe(200);
    expect((await loadRes.json()).system.name).toBe("http-roundtrip");
  });

  it("404s a static path that tries to escape the studio directory", async () => {
    const res = await fetch(`${base}/../../../etc/passwd`);
    expect(res.status).toBe(404);
  });

  it("404s an encoded traversal and a backslash traversal that fetch won't normalize", async () => {
    for (const path of ["/..%2f..%2f..%2fetc%2fpasswd", "/%2e%2e%2f%2e%2e%2fetc%2fpasswd", "/..\\..\\..\\etc\\passwd"]) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("not found");
    }
  });

  // fetch() refuses to set Host (a forbidden header name), so the rebinding
  // cases go over a raw client where the attacker controls it.
  function rawGet(path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
    const port = (server.address() as AddressInfo).port;
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET", headers }, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (data += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      });
      req.on("error", reject);
      req.end();
    });
  }

  it("rejects a request whose Host header is an attacker's rebound hostname", async () => {
    for (const host of ["evil.example.com", "kernic.attacker.test:1234", "localhost.evil.com"]) {
      const res = await rawGet("/api/meta", { Host: host });
      expect(res.status).toBe(403);
      expect(JSON.parse(res.body).error).toBe("Forbidden host");
    }
  });

  it("rejects a rebound Host on the static files too, not just the API", async () => {
    const res = await rawGet("/", { Host: "evil.example.com" });
    expect(res.status).toBe(403);
  });

  it("accepts the localhost spelling of our own Host", async () => {
    const port = (server.address() as AddressInfo).port;
    const res = await rawGet("/api/meta", { Host: `localhost:${port}` });
    expect(res.status).toBe(200);
  });

  it("rejects a cross-site POST to /api/save and writes nothing", async () => {
    const body = JSON.stringify({
      name: "csrf-victim",
      colors: FIXTURE_VIBE_DS.colors,
      fonts: FIXTURE_VIBE_DS.fonts,
      semantic: FIXTURE_VIBE_DS.semantic,
      radius: FIXTURE_VIBE_DS.radius,
      typeScale: FIXTURE_VIBE_DS.typeScale,
    });
    const res = await fetch(`${base}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example.com" },
      body,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden origin");

    // A form POST (no Origin at all in some legacy paths) is refused too.
    const noOrigin = await fetch(`${base}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(noOrigin.status).toBe(403);

    // And nothing reached the disk.
    expect((await fetch(`${base}/api/load/csrf-victim`)).status).toBe(404);
  });

  it("still serves same-origin POSTs to /api/palette", async () => {
    const res = await fetch(`${base}/api/palette`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ primarySeed: "#3366cc" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).colors.primary["500"]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("rejects an oversized request body with 413", async () => {
    const res = await fetch(`${base}/api/palette`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ primarySeed: "#3366cc", pad: "x".repeat(MAX_BODY_BYTES + 1024) }),
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("Request body too large");
  });

  it("returns 400, not 500, for a malformed JSON body", async () => {
    const res = await fetch(`${base}/api/palette`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Malformed JSON body");
  });

  it("serves /api/fonts with the ranked results, live flag and total", async () => {
    // The setup-file fetch guard makes the Google metadata call fail, so this
    // exercises the bundled offline path end to end.
    const res = await fetch(`${base}/api/fonts?q=mono&limit=3`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBe(3);
    expect(body.total).toBeGreaterThan(3);
    expect(typeof body.live).toBe("boolean");
    expect(body.results[0]).toHaveProperty("family");
    expect(body.results[0]).toHaveProperty("category");
  });

  it("clamps an unbounded /api/fonts limit", async () => {
    const res = await fetch(`${base}/api/fonts?q=&limit=99999`);
    const body = await res.json();
    expect(body.results.length).toBeLessThanOrEqual(FONT_LIMIT_MAX);
    expect(body.total).toBeGreaterThanOrEqual(body.results.length);
  });

  it("defaults /api/fonts to 30 results and leads with recognisable families", async () => {
    const res = await fetch(`${base}/api/fonts?q=`);
    const body = await res.json();
    expect(body.results.length).toBe(FONT_LIMIT_DEFAULT);
    expect(body.results[0].family).toBe("Inter");
  });

  it("sends the security headers, and a CSP that still allows Google Fonts", async () => {
    const res = await fetch(`${base}/`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    // The live preview needs the css2 stylesheet and the font files it points at.
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
    // Inline style attributes drive the live swatches.
    expect(csp).toContain("'unsafe-inline'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("does not leak internal detail in an API error body", async () => {
    const res = await fetch(`${base}/api/load/${encodeURIComponent("nope")}`);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(JSON.stringify(body)).not.toContain(dir);
    expect(JSON.stringify(body)).not.toContain("/Users");
  });

  it("serves the Studio's own index.html at /", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

describe("openBrowser", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;

  beforeEach(() => {
    spawnMock.mockReset().mockReturnValue({ unref: vi.fn() });
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", platformDescriptor);
  });

  it.each([
    ["darwin", "open", ["http://x"]],
    ["win32", "cmd", ["/c", "start", "", "http://x"]],
    ["linux", "xdg-open", ["http://x"]],
  ] as const)("uses %s's platform command", (platform, expectedCmd, expectedArgs) => {
    Object.defineProperty(process, "platform", { value: platform });

    openBrowser("http://x");

    expect(spawnMock).toHaveBeenCalledWith(expectedCmd, expectedArgs, { detached: true, stdio: "ignore" });
  });
});
