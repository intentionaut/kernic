import { access, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { migrateSystem } from "./tokens.ts";
import type { DesignSystem, DesignSystemV1 } from "./types.ts";

let migrated = false;

/**
 * Resolves the user's home directory, honoring KERNIC_HOME_DIR when set.
 * This exists for test isolation (point it at a temp dir so tests never
 * touch a real ~/.config/kernic), and doubles as a legitimate escape hatch
 * for running kernic somewhere $HOME isn't writable (e.g. some containers).
 */
function homeDir(): string {
  return process.env.KERNIC_HOME_DIR ?? homedir();
}

/** One-time migration chain: ~/.config/dsforge and ~/.config/umbrik → ~/.config/kernic */
async function migrateLegacy(): Promise<void> {
  if (migrated) return;
  migrated = true;
  const dir = join(homeDir(), ".config", "kernic");
  for (const legacyName of ["dsforge", "umbrik"]) {
    const legacy = join(homeDir(), ".config", legacyName);
    try {
      await access(legacy);
    } catch {
      continue;
    }
    const existing = await readdir(join(dir, "systems")).catch(() => [] as string[]);
    if (existing.length === 0) {
      await mkdir(dir, { recursive: true });
      for (const entry of ["systems", "fonts-cache.json"]) {
        try {
          await rename(join(legacy, entry), join(dir, entry));
        } catch {}
      }
      // Only remove the legacy directory once its contents have actually
      // been migrated. If `dir` already had systems, migration is skipped
      // above — the legacy directory (and its data) must survive that,
      // rather than being deleted with nothing having moved.
      await rm(legacy, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function configDir(): Promise<string> {
  await migrateLegacy();
  const dir = join(homeDir(), ".config", "kernic");
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function systemsDir(): Promise<string> {
  const dir = join(await configDir(), "systems");
  await mkdir(dir, { recursive: true });
  return dir;
}

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");

export function normalizeName(name: string): string | null {
  const s = slug(name);
  return s.length > 0 ? s : null;
}

export async function saveSystem(ds: DesignSystem): Promise<void> {
  const file = join(await systemsDir(), `${ds.name}.json`);
  await writeFile(file, JSON.stringify(ds, null, 2) + "\n", "utf8");
}

export async function loadSystem(name: string): Promise<DesignSystem | null> {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  try {
    const raw = await readFile(join(await systemsDir(), `${normalized}.json`), "utf8");
    // A version-1 file gains the token groups version 2 added, derived from
    // its own ramps and vibe. Keys this version does not know are kept.
    return migrateSystem(JSON.parse(raw) as DesignSystem | DesignSystemV1);
  } catch {
    return null;
  }
}

export async function listSystems(): Promise<DesignSystem[]> {
  try {
    const dir = await systemsDir();
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
    const systems: DesignSystem[] = [];
    for (const f of files) {
      try {
        systems.push(JSON.parse(await readFile(join(dir, f), "utf8")) as DesignSystem);
      } catch {
        // Skip a corrupted file rather than failing the whole listing —
        // one bad file used to take every other system down with it.
      }
    }
    return systems;
  } catch {
    return [];
  }
}

export async function deleteSystem(name: string): Promise<boolean> {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  try {
    await unlink(join(await systemsDir(), `${normalized}.json`));
    return true;
  } catch {
    return false;
  }
}
