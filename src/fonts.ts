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
      headers: { "User-Agent": "kernic/0.1" },
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

/**
 * Longest query we will actually search with. Anything past this can only
 * narrow an already-empty result set, so truncating bounds the per-keystroke
 * work a caller can force regardless of what they send.
 */
export const MAX_FONT_QUERY_LENGTH = 64;

/** Popularity ordering for the curated head, derived from BUNDLED's hand-picked order. */
const CURATED_RANK: ReadonlyMap<string, number> = new Map(
  BUNDLED.map((f, i) => [f.family.toLowerCase(), i] as const)
);

interface IndexedFont {
  font: FontInfo;
  /** Lowercased family, computed once per catalog rather than once per query. */
  lower: string;
  /** Lowercased words, for word-boundary matching ("mono" → "JetBrains Mono"). */
  words: string[];
}

// Keyed on the catalog array itself: as long as a caller reuses the same array
// (getFontCatalog returns one array per call), the ~2000 lowercase conversions
// and the curated ordering are done once, not on every debounced keystroke.
const indexCache = new WeakMap<readonly FontInfo[], IndexedFont[]>();
const curatedCache = new WeakMap<readonly FontInfo[], FontInfo[]>();

function buildIndex(catalog: readonly FontInfo[]): IndexedFont[] {
  const cached = indexCache.get(catalog);
  if (cached) return cached;
  const built = catalog.map((font) => {
    const lower = font.family.toLowerCase();
    return { font, lower, words: lower.split(/[\s\-_]+/).filter(Boolean) };
  });
  indexCache.set(catalog, built);
  return built;
}

function compareLower(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Ordering for an empty query: the hand-picked popular families first (in
 * BUNDLED's order), then everything else alphabetically. An arbitrary
 * catalog.slice() would show whatever Google happens to list first.
 */
function curatedOrder(catalog: readonly FontInfo[], index: IndexedFont[]): FontInfo[] {
  const cached = curatedCache.get(catalog);
  if (cached) return cached;
  const ordered = index
    .map((entry) => ({ entry, rank: CURATED_RANK.get(entry.lower) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || compareLower(a.entry.lower, b.entry.lower))
    .map((scored) => scored.entry.font);
  curatedCache.set(catalog, ordered);
  return ordered;
}

/** Match tier, lowest wins: 0 exact, 1 prefix, 2 word start, 3 substring, -1 no match. */
function matchTier(entry: IndexedFont, q: string): number {
  if (entry.lower === q) return 0;
  if (entry.lower.startsWith(q)) return 1;
  if (!entry.lower.includes(q)) return -1;
  for (let i = 1; i < entry.words.length; i++) {
    if (entry.words[i].startsWith(q)) return 2;
  }
  return 3;
}

/**
 * All catalog entries matching `query`, most relevant first: exact match, then
 * prefix, then word-boundary, then substring — alphabetical within each tier so
 * results don't jitter between keystrokes. Returns the full match set; callers
 * truncate (and report the untruncated count).
 */
export function rankFonts(catalog: readonly FontInfo[], query: string): FontInfo[] {
  const index = buildIndex(catalog);
  const q = (query ?? "").trim().toLowerCase().slice(0, MAX_FONT_QUERY_LENGTH);
  if (!q) return curatedOrder(catalog, index);

  const matches: { font: FontInfo; tier: number; lower: string }[] = [];
  for (const entry of index) {
    const tier = matchTier(entry, q);
    if (tier >= 0) matches.push({ font: entry.font, tier, lower: entry.lower });
  }
  matches.sort((a, b) => a.tier - b.tier || compareLower(a.lower, b.lower));
  return matches.map((m) => m.font);
}

/** Relevance-ranked search, truncated to `limit`. See rankFonts for the ordering. */
export async function searchFonts(catalog: readonly FontInfo[], query: string, limit = 40): Promise<FontInfo[]> {
  return rankFonts(catalog, query).slice(0, Math.max(0, limit));
}

/** Google Fonts css2 URL for a family with sensible weights. */
export function fontImportUrl(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`;
}
