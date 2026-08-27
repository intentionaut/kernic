import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fontImportUrl, getFontCatalog, searchFonts } from "./fonts.ts";

describe("searchFonts (pure)", () => {
  const catalog = [
    { family: "Inter", category: "sans-serif" },
    { family: "JetBrains Mono", category: "monospace" },
    { family: "Space Mono", category: "monospace" },
    { family: "Fraunces", category: "serif" },
  ];

  it("returns the first `limit` entries for an empty or whitespace query", async () => {
    expect(await searchFonts(catalog, "", 2)).toEqual(catalog.slice(0, 2));
    expect(await searchFonts(catalog, "   ", 2)).toEqual(catalog.slice(0, 2));
  });

  it("matches case-insensitively as a substring", async () => {
    const results = await searchFonts(catalog, "mono", 10);
    expect(results.map((f) => f.family)).toEqual(["JetBrains Mono", "Space Mono"]);
  });

  it("respects the limit even with more matches available", async () => {
    const results = await searchFonts(catalog, "mono", 1);
    expect(results.length).toBe(1);
  });
});

describe("fontImportUrl (pure)", () => {
  it("replaces spaces with + and builds the expected css2 URL", () => {
    expect(fontImportUrl("DM Serif Display")).toBe(
      "https://fonts.googleapis.com/css2?family=DM+Serif+Display:wght@400;500;600;700&display=swap"
    );
  });

  it("leaves a single-word family unchanged", () => {
    expect(fontImportUrl("Inter")).toBe(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
    );
  });
});

const liveCatalogFonts = Array.from({ length: 60 }, (_, i) => ({
  family: `Font ${i}`,
  category: "sans-serif",
}));

describe("getFontCatalog", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-fonts-test-"));
    process.env.KERNIC_HOME_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.KERNIC_HOME_DIR;
    await rm(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("returns the cached catalog and never calls fetch when the cache is fresh", async () => {
    await mkdir(join(dir, ".config", "kernic"), { recursive: true });
    await writeFile(
      join(dir, ".config", "kernic", "fonts-cache.json"),
      JSON.stringify({ fetchedAt: new Date().toISOString(), fonts: liveCatalogFonts })
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getFontCatalog();
    expect(result.live).toBe(true);
    expect(result.fonts.length).toBe(60);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refetches when the cache is older than 24h, stripping the )]}' XSSI prefix", async () => {
    await mkdir(join(dir, ".config", "kernic"), { recursive: true });
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await writeFile(
      join(dir, ".config", "kernic", "fonts-cache.json"),
      JSON.stringify({ fetchedAt: stale, fonts: liveCatalogFonts })
    );
    const payload = ")]}'\n" + JSON.stringify({ familyMetadataList: liveCatalogFonts.map((f) => ({ family: f.family, category: "Sans-Serif" })) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => payload }))
    );

    const result = await getFontCatalog();
    expect(result.live).toBe(true);
    expect(result.fonts.length).toBe(60);
    expect(result.fonts[0].category).toBe("sans-serif"); // lowercased
  });

  it("falls back to the bundled catalog when fetch fails, with no cache present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const result = await getFontCatalog();
    expect(result.live).toBe(false);
    expect(result.fonts.length).toBe(50);
    expect(result.fonts.some((f) => f.family === "Inter")).toBe(true);
  });

  it("falls back to bundled when the response payload is malformed (too few fonts)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({ familyMetadataList: [{ family: "Only One", category: "sans-serif" }] }),
      }))
    );
    const result = await getFontCatalog();
    expect(result.live).toBe(false);
    expect(result.fonts.length).toBe(50);
  });

  it("falls back to bundled on a non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, text: async () => "" }))
    );
    const result = await getFontCatalog();
    expect(result.live).toBe(false);
    expect(result.fonts.length).toBe(50);
  });
});
