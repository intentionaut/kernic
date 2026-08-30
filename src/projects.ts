import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { renderProjectFile, type Artifact } from "./export.ts";
import { configDir, loadSystem } from "./storage.ts";

/* ──────────────────────────── the placeholder ────────────────────────────
 * PLACEHOLDER — the owner fills this in. Leave it empty until there is a real
 * page to send people to.
 *
 * The cloud tier does not exist yet, so there is deliberately no product name,
 * no price, no URL and no date anywhere in this file. When CLOUD_CTA is empty
 * the portfolio note still prints: it is a true statement about a real limit of
 * a local-only tool plus the exact commands that fix it, which is useful on its
 * own. When it is filled in, it is appended as one extra line.
 *
 * Example of the shape expected (do not ship any of these as-is):
 *   export const CLOUD_CTA = "Want this to happen automatically? <url>";
 * ------------------------------------------------------------------------ */
export const CLOUD_CTA = "";

/* ─────────────────────────────── the registry ─────────────────────────── */

export interface ProjectRecord {
  /** Absolute path to the project directory kernic wrote into. */
  path: string;
  /** Design system name that was applied. */
  system: string;
  /** ISO timestamp of the application. */
  appliedAt: string;
  /** Content hash of exactly what was written, so drift is detectable later. */
  hash: string;
  /** Filenames written, relative to `path`. */
  files: string[];
}

export interface Registry {
  version: number;
  /** User opted out of the portfolio note. */
  muted: boolean;
  /** Fingerprints of notes already shown, so a note fires once per event. */
  shown: string[];
  projects: ProjectRecord[];
}

export const REGISTRY_VERSION = 1;
export const REGISTRY_FILE = "projects.json";

/** Env opt-out. Any non-empty value other than "0"/"false" mutes the note. */
export const MUTE_ENV_VAR = "KERNIC_NO_UPSELL";

const emptyRegistry = (): Registry => ({ version: REGISTRY_VERSION, muted: false, shown: [], projects: [] });

export async function registryPath(): Promise<string> {
  return join(await configDir(), REGISTRY_FILE);
}

/** Stable content hash of what was written. Order-independent. */
export function hashArtifacts(artifacts: readonly Artifact[]): string {
  const h = createHash("sha256");
  for (const a of [...artifacts].sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : 0))) {
    // Length-prefixed, not separator-delimited: a separator can be moved across
    // the field boundary to make two different inputs hash the same, and there
    // is no separator a filename or a file's contents cannot contain.
    h.update(`${Buffer.byteLength(a.file)}:${a.file}`);
    h.update(`${Buffer.byteLength(a.content)}:${a.content}`);
  }
  return h.digest("hex");
}

function isRecord(value: unknown): value is ProjectRecord {
  const r = value as ProjectRecord | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.path === "string" &&
    r.path.length > 0 &&
    typeof r.system === "string" &&
    r.system.length > 0 &&
    typeof r.appliedAt === "string" &&
    typeof r.hash === "string" &&
    Array.isArray(r.files) &&
    r.files.every((f) => typeof f === "string")
  );
}

/**
 * Read the registry. Never throws and never rejects: a missing, unreadable,
 * truncated or otherwise corrupt file degrades to an empty registry, the same
 * way listSystems() already tolerates a corrupted system file. Losing the
 * record of which projects use which system is annoying; failing a user's
 * `kernic context` run because of it would be worse.
 */
export async function readRegistry(): Promise<Registry> {
  try {
    const raw = await readFile(await registryPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Registry> | null;
    if (!parsed || typeof parsed !== "object") return emptyRegistry();
    return {
      version: typeof parsed.version === "number" ? parsed.version : REGISTRY_VERSION,
      muted: parsed.muted === true,
      shown: Array.isArray(parsed.shown) ? parsed.shown.filter((s): s is string => typeof s === "string") : [],
      // Drop only the entries that are malformed, never the whole file.
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter(isRecord) : [],
    };
  } catch {
    return emptyRegistry();
  }
}

async function writeRegistryFile(registry: Registry): Promise<void> {
  const path = await registryPath();
  // Write-then-rename so a crash mid-write can never leave a half-file behind.
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(registry, null, 2) + "\n", "utf8");
  await rename(tmp, path);
}

const LOCK_STALE_MS = 10_000;
const LOCK_ATTEMPTS = 50;
const LOCK_WAIT_MS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Serialise read-modify-write so two kernic processes applying systems at the
 * same time do not clobber each other's entry. mkdir is atomic on every
 * platform we support, so an exclusive directory is the lock.
 *
 * If the lock cannot be taken (another process wedged, or a read-only config
 * dir), the update still runs unlocked rather than failing the caller — a lost
 * registry entry is recoverable, a crashed `kernic context` is not.
 */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let lockDir: string | null = null;
  try {
    lockDir = join(await configDir(), `${REGISTRY_FILE}.lock`);
  } catch {
    return fn();
  }
  let held = false;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
    try {
      await mkdir(lockDir, { recursive: false });
      held = true;
      break;
    } catch {
      // Reclaim a lock left behind by a process that died holding it.
      try {
        const info = await stat(lockDir);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      await sleep(LOCK_WAIT_MS);
    }
  }
  try {
    return await fn();
  } finally {
    if (held) await rm(lockDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Mutate the registry under the lock. Swallows write failures. */
async function updateRegistry<T>(fn: (registry: Registry) => T | Promise<T>): Promise<T | null> {
  try {
    return await withLock(async () => {
      const registry = await readRegistry();
      const result = await fn(registry);
      await writeRegistryFile(registry);
      return result;
    });
  } catch {
    return null;
  }
}

/* ───────────────────────────── pruning & listing ──────────────────────── */

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when a project directory is gone *and* we can prove it: the parent
 * directory is readable and simply does not contain it. An unreadable or
 * missing parent (unmounted external drive, a network share that is offline,
 * a permissions change) means "cannot tell", never "delete the history".
 */
export async function isProvablyGone(projectPath: string): Promise<boolean> {
  if (await exists(projectPath)) return false;
  const parent = dirname(projectPath);
  if (parent === projectPath) return false; // filesystem root — never prune
  try {
    await readdir(parent);
    return true;
  } catch {
    return false;
  }
}

/**
 * All recorded applications, with entries for provably-deleted projects pruned
 * (and the pruned registry persisted). Never throws.
 */
export async function listProjects(): Promise<ProjectRecord[]> {
  const registry = await readRegistry();
  const keep: ProjectRecord[] = [];
  let pruned = false;
  for (const record of registry.projects) {
    if (await isProvablyGone(record.path)) {
      pruned = true;
      continue;
    }
    keep.push(record);
  }
  if (pruned) {
    await updateRegistry((r) => {
      const survivors = new Set(keep.map((k) => `${k.path}\0${k.system}`));
      r.projects = r.projects.filter((p) => survivors.has(`${p.path}\0${p.system}`));
    });
  }
  return keep;
}

/** Recorded applications of one design system. */
export async function projectsUsing(system: string): Promise<ProjectRecord[]> {
  return (await listProjects()).filter((p) => p.system === system);
}

/** Distinct project directories kernic has written a system into. */
export async function projectCount(): Promise<number> {
  return new Set((await listProjects()).map((p) => p.path)).size;
}

/* ──────────────────────────── recording an apply ──────────────────────── */

export interface ApplicationResult {
  record: ProjectRecord;
  /** Distinct project directories in the registry after this application. */
  projectCount: number;
  /** This application introduced a project directory kernic had not seen. */
  isNewProject: boolean;
}

/**
 * Record that `system` was applied to `projectPath`. Keyed by (path, system),
 * so re-applying refreshes the entry in place and a project genuinely using two
 * systems keeps both. Never throws: if the registry cannot be written the
 * caller still gets an accurate result for this run.
 */
export async function recordApplication(input: {
  projectPath: string;
  system: string;
  artifacts: readonly Artifact[];
  now?: string;
}): Promise<ApplicationResult> {
  const record: ProjectRecord = {
    path: input.projectPath,
    system: input.system,
    appliedAt: input.now ?? new Date().toISOString(),
    hash: hashArtifacts(input.artifacts),
    files: input.artifacts.map((a) => a.file),
  };

  const result = await updateRegistry((registry): ApplicationResult => {
    const knownPaths = new Set(registry.projects.map((p) => p.path));
    const isNewProject = !knownPaths.has(record.path);
    const idx = registry.projects.findIndex((p) => p.path === record.path && p.system === record.system);
    if (idx >= 0) registry.projects[idx] = record;
    else registry.projects.push(record);
    return {
      record,
      projectCount: new Set(registry.projects.map((p) => p.path)).size,
      isNewProject,
    };
  });

  return result ?? { record, projectCount: 1, isNewProject: true };
}

/* ─────────────────────────────── drift ────────────────────────────────── */

export type ProjectState =
  /** The files on disk are what this system produces today. */
  | "current"
  /** The system changed since it was applied — the project has older tokens. */
  | "stale"
  /** The design system was deleted or renamed; nothing to compare against. */
  | "system-missing"
  /** The project directory could not be reached (unmounted drive, permissions). */
  | "unreachable";

export interface ProjectStatus {
  record: ProjectRecord;
  state: ProjectState;
  /** Copy-ready commands that bring this project back in line. */
  fix: string[];
}

const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s);

/**
 * The exact commands that re-apply a system to a project. This is the manual
 * path, and it is meant to be genuinely good: everything a user needs is on
 * screen, ready to paste, for as long as they want to do it by hand.
 */
export function fixCommands(record: ProjectRecord): string[] {
  const path = quote(record.path);
  const system = quote(record.system);
  const commands: string[] = [];
  if (record.files.includes("design.md") || record.files.includes("tokens.json")) {
    commands.push(`kernic context ${system} -o ${path}`);
  }
  const extras: Array<[string, string]> = [
    ["tokens.css", "css"],
    ["tailwind.css", "tailwind"],
    ["fonts.html", "fonts"],
    ["tokens.dtcg.json", "dtcg"],
  ];
  for (const [file, format] of extras) {
    if (record.files.includes(file)) commands.push(`kernic export ${system} -f ${format} -o ${path}`);
  }
  if (commands.length === 0) commands.push(`kernic context ${system} -o ${path}`);
  return commands;
}

/** Status of every recorded project. Never throws. */
export async function checkProjects(): Promise<ProjectStatus[]> {
  const records = await listProjects();
  const statuses: ProjectStatus[] = [];
  const cache = new Map<string, Awaited<ReturnType<typeof loadSystem>>>();

  for (const record of records) {
    const fix = fixCommands(record);
    if (!(await exists(record.path))) {
      statuses.push({ record, state: "unreachable", fix });
      continue;
    }
    if (!cache.has(record.system)) {
      cache.set(record.system, await loadSystem(record.system).catch(() => null));
    }
    const ds = cache.get(record.system) ?? null;
    if (!ds) {
      statuses.push({ record, state: "system-missing", fix });
      continue;
    }
    const artifacts: Artifact[] = [];
    let renderable = true;
    for (const file of record.files) {
      const content = renderProjectFile(ds, file);
      if (content === null) {
        renderable = false;
        break;
      }
      artifacts.push({ file, content });
    }
    // A file kernic no longer knows how to regenerate can't be judged; treat it
    // as current rather than crying drift at something we cannot verify.
    const state: ProjectState = !renderable || hashArtifacts(artifacts) === record.hash ? "current" : "stale";
    statuses.push({ record, state, fix });
  }
  return statuses;
}

export async function staleProjects(): Promise<ProjectStatus[]> {
  return (await checkProjects()).filter((s) => s.state === "stale");
}

/* ─────────────────────── the portfolio note (TASK 4) ───────────────────── */

export function mutedByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[MUTE_ENV_VAR];
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

/** Persist the opt-out so it survives across sessions. */
export async function muteNotices(): Promise<void> {
  await updateRegistry((registry) => {
    registry.muted = true;
  });
}

export async function unmuteNotices(): Promise<void> {
  await updateRegistry((registry) => {
    registry.muted = false;
  });
}

/**
 * The note fires once per distinct event and never again. The fingerprint is
 * the event: "you now build in N places", or "these exact projects drifted".
 * Re-running the same command with nothing changed says nothing.
 */
export async function claimNotice(fingerprint: string): Promise<boolean> {
  if (mutedByEnv()) return false;
  const registry = await readRegistry();
  if (registry.muted) return false;
  if (registry.shown.includes(fingerprint)) return false;
  await updateRegistry((r) => {
    if (!r.shown.includes(fingerprint)) r.shown.push(fingerprint);
  });
  return true;
}

const withCta = (lines: string[]): string => [...lines, ...(CLOUD_CTA ? ["", CLOUD_CTA] : [])].join("\n");

/**
 * Shown once, the first time a system lands in a second (or later) project.
 *
 * The promise on the tin is "one design system, tuned once, applied
 * everywhere". At one app that is true. Across a portfolio, "everywhere" is
 * something the user does by hand, once per app, every time the system changes.
 * That gap is real, it is the honest thing to name, and naming it alongside the
 * command that closes it keeps the manual path first-class.
 */
export function multiProjectNote(count: number, system: string): string {
  return withCta([
    `${system} now runs in ${count} projects — that's one identity across everything you build.`,
    "Holding it there is manual: when you change the system, each project keeps the old",
    "tokens until you re-apply it there. `kernic apps` shows you which ones have fallen",
    "behind and prints the command to bring each one back.",
  ]);
}

/**
 * Shown once per distinct set of drifted projects, from `kernic apps`.
 * The commands to fix them are printed next to this, by the caller.
 */
export function driftNote(count: number): string {
  const apps = count === 1 ? "1 app is" : `${count} apps are`;
  return withCta([
    `${apps} still on an older version of your design system, so what you build there`,
    "won't match the rest. The commands above fix that — one run per project, whenever",
    "you want your work to look like it all came from the same person.",
  ]);
}

/** Fingerprint for the drift note: the exact set of stale projects. */
export function driftFingerprint(statuses: readonly ProjectStatus[]): string {
  return `drift:${statuses
    .map((s) => `${s.record.path}\0${s.record.system}\0${s.record.hash}`)
    .sort()
    .join("|")}`;
}

/** Fingerprint for the multi-project note: the portfolio size. */
export function multiProjectFingerprint(count: number): string {
  return `multi:${count}`;
}

/** Test/maintenance helper: remove the registry file entirely. */
export async function clearRegistry(): Promise<void> {
  try {
    await unlink(await registryPath());
  } catch {
    /* nothing to clear */
  }
}
