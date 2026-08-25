import { access, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DesignSystem } from "./types.ts";

let migrated = false;

/** One-time migration chain: ~/.config/dsforge and ~/.config/umbrik → ~/.config/kernic */
async function migrateLegacy(): Promise<void> {
  if (migrated) return;
  migrated = true;
  const dir = join(homedir(), ".config", "kernic");
  for (const legacyName of ["dsforge", "umbrik"]) {
    const legacy = join(homedir(), ".config", legacyName);
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
    }
    await rm(legacy, { recursive: true, force: true }).catch(() => {});
  }
}

export async function configDir(): Promise<string> {
  await migrateLegacy();
  const dir = join(homedir(), ".config", "kernic");
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
    const ds = JSON.parse(raw) as DesignSystem;
    // Backfill pre-schema files; unknown extension keys are preserved for premium/cloud features.
    if (!ds.schemaVersion) ds.schemaVersion = 1;
    return ds;
  } catch {
    return null;
  }
}

export async function listSystems(): Promise<DesignSystem[]> {
  try {
    const files = (await readdir(await systemsDir())).filter((f) => f.endsWith(".json")).sort();
    const systems = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(join(await systemsDir(), f), "utf8")) as DesignSystem)
    );
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
