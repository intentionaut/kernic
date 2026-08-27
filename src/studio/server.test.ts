import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  apiFonts,
  apiLoad,
  apiLooks,
  apiMeta,
  apiRandom,
  apiSave,
  buildPalette,
  createStudioServer,
  deriveSeeds,
  openBrowser,
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
  it("delegates to the injected getFontCatalog/searchFonts", async () => {
    const getFontCatalog = vi.fn(async () => ({ fonts: [{ family: "Foo", category: "sans-serif" }], live: true }));
    const searchFonts = vi.fn(async () => [{ family: "Foo", category: "sans-serif" }]);
    const result = await apiFonts("fo", { getFontCatalog, searchFonts });
    expect(getFontCatalog).toHaveBeenCalledOnce();
    expect(searchFonts).toHaveBeenCalledWith([{ family: "Foo", category: "sans-serif" }], "fo", 30);
    expect(result.live).toBe(true);
    expect(result.results).toEqual([{ family: "Foo", category: "sans-serif" }]);
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

  it("normalizes the name, stamps schemaVersion 1, and saves on success", async () => {
    const saveSystem = vi.fn();
    const result = await apiSave(
      { name: "My Brand!!", colors: FIXTURE_VIBE_DS.colors, fonts: FIXTURE_VIBE_DS.fonts, semantic: FIXTURE_VIBE_DS.semantic, radius: FIXTURE_VIBE_DS.radius, typeScale: FIXTURE_VIBE_DS.typeScale },
      { saveSystem }
    );
    expect(result.status).toBe(200);
    expect((result.body as any).name).toBe("my-brand");
    expect(saveSystem).toHaveBeenCalledOnce();
    expect(saveSystem.mock.calls[0][0].schemaVersion).toBe(1);
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
