import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { configDir } from "./storage.ts";

export interface FontInfo {
  family: string;
  category: string;
}

/** Bundled fallback catalog — popular Google Fonts by category. */
const BUNDLED: FontInfo[] = [
  { family: "Inter", category: "sans-serif" }, { family: "Roboto", category: "sans-serif" },
  { family: "Open Sans", category: "sans-serif" }, { family: "Lato", category: "sans-serif" },
  { family: "Montserrat", category: "sans-serif" }, { family: "Poppins", category: "sans-serif" },
  { family: "Outfit", category: "sans-serif" }, { family: "Work Sans", category: "sans-serif" },
  { family: "Public Sans", category: "sans-serif" }, { family: "Source Sans 3", category: "sans-serif" },
  { family: "Nunito", category: "sans-serif" }, { family: "Nunito Sans", category: "sans-serif" },
  { family: "Karla", category: "sans-serif" }, { family: "Rubik", category: "sans-serif" },
  { family: "Manrope", category: "sans-serif" }, { family: "Figtree", category: "sans-serif" },
  { family: "Space Grotesk", category: "sans-serif" }, { family: "DM Sans", category: "sans-serif" },
  { family: "Plus Jakarta Sans", category: "sans-serif" }, { family: "Sora", category: "sans-serif" },
  { family: "Archivo", category: "sans-serif" }, { family: "Fredoka", category: "sans-serif" },
  { family: "Quicksand", category: "sans-serif" }, { family: "Baloo 2", category: "sans-serif" },
  { family: "Playfair Display", category: "serif" }, { family: "Merriweather", category: "serif" },
  { family: "Lora", category: "serif" }, { family: "Libre Baskerville", category: "serif" },
  { family: "PT Serif", category: "serif" }, { family: "Crimson Pro", category: "serif" },
  { family: "Fraunces", category: "serif" }, { family: "DM Serif Display", category: "serif" },
  { family: "Cormorant Garamond", category: "serif" }, { family: "EB Garamond", category: "serif" },
  { family: "Bitter", category: "serif" }, { family: "Zilla Slab", category: "serif" },
  { family: "JetBrains Mono", category: "monospace" }, { family: "IBM Plex Mono", category: "monospace" },
  { family: "Fira Code", category: "monospace" }, { family: "Space Mono", category: "monospace" },
  { family: "Source Code Pro", category: "monospace" }, { family: "Martian Mono", category: "monospace" },
  { family: "Courier Prime", category: "monospace" }, { family: "Geist Mono", category: "monospace" },
  { family: "Archivo Black", category: "display" }, { family: "Anton", category: "display" },
  { family: "Bebas Neue", category: "display" }, { family: "Unbounded", category: "display" },
  { family: "Syne", category: "display" }, { family: "Clash Display", category: "display" },
];

interface CacheFile {
  fetchedAt: string;
  fonts: FontInfo[];
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function cachePath(): Promise<string> {
  const dir = await configDir();
  return join(dir, "fonts-cache.json");
}

async function readCache(): Promise<FontInfo[] | null> {
  try {
    const raw = JSON.parse(await readFile(await cachePath(), "utf8")) as CacheFile;
    if (Date.now() - Date.parse(raw.fetchedAt) < CACHE_TTL_MS && raw.fonts?.length > 50) return raw.fonts;
  } catch {}
  return null;
}

async function writeCache(fonts: FontInfo[]): Promise<void> {
  try {
    const data: CacheFile = { fetchedAt: new Date().toISOString(), fonts };
    await writeFile(await cachePath(), JSON.stringify(data));
  } catch {}
}

/** Full Google Fonts catalog via the public metadata endpoint; falls back to bundled list. */
export async function getFontCatalog(): Promise<{ fonts: FontInfo[]; live: boolean }> {
  const cached = await readCache();
  if (cached) return { fonts: cached, live: true };

  try {
    const res = await fetch("https://fonts.google.com/metadata/fonts", {
      headers: { "User-Agent": "umbrik/0.1" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = await res.text();
    if (text.startsWith(")]}'")) text = text.slice(text.indexOf("\n") + 1);
    const json = JSON.parse(text) as { familyMetadataList: { family: string; category: string }[] };
    const fonts = json.familyMetadataList.map((f) => ({ family: f.family, category: f.category.toLowerCase() }));
    if (fonts.length < 50) throw new Error("unexpected payload");
    void writeCache(fonts);
    return { fonts, live: true };
  } catch {
    return { fonts: BUNDLED, live: false };
  }
}

export async function searchFonts(catalog: FontInfo[], query: string, limit = 40): Promise<FontInfo[]> {
  const q = query.trim().toLowerCase();
  if (!q) return catalog.slice(0, limit);
  return catalog.filter((f) => f.family.toLowerCase().includes(q)).slice(0, limit);
}

/** Google Fonts css2 URL for a family with sensible weights. */
export function fontImportUrl(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`;
}
