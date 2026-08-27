import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSystem, listSystems, loadSystem, normalizeName, saveSystem } from "./storage.ts";
import type { DesignSystem } from "./types.ts";

const sampleDs = (name: string): DesignSystem => ({
  schemaVersion: 1,
  name,
  vibe: "tech",
  createdAt: "2024-01-01T00:00:00.000Z",
  colors: { primary: { "500": "#123456" }, accent: { "500": "#654321" }, neutral: { "500": "#888888" } },
  semantic: {
    background: { light: "#fff", dark: "#000" },
    surface: { light: "#fff", dark: "#000" },
    text: { light: "#000", dark: "#fff" },
    mutedText: { light: "#666", dark: "#999" },
    border: { light: "#eee", dark: "#333" },
    ring: "#123456",
  },
  fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  radius: { style: "soft", sm: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem" },
  typeScale: { ratio: 1.25, baseRem: 1 },
});

describe("normalizeName", () => {
  it("lowercases, strips punctuation, and dash-joins", () => {
    expect(normalizeName("My Brand!!")).toBe("my-brand");
  });

  it("collapses repeated and trims leading/trailing dashes", () => {
    expect(normalizeName("--foo   bar--")).toBe("foo-bar");
  });

  it("returns null for whitespace-only input", () => {
    expect(normalizeName("   ")).toBeNull();
  });
});

describe("storage CRUD", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-storage-test-"));
    process.env.KERNIC_HOME_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.KERNIC_HOME_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a saved system through loadSystem", async () => {
    const ds = sampleDs("roundtrip");
    await saveSystem(ds);
    expect(await loadSystem("roundtrip")).toEqual(ds);
  });

  it("backfills a missing schemaVersion on load without touching other fields", async () => {
    await mkdir(join(dir, ".config", "kernic", "systems"), { recursive: true });
    const raw = { ...sampleDs("legacy-file") };
    delete (raw as Partial<DesignSystem>).schemaVersion;
    await writeFile(join(dir, ".config", "kernic", "systems", "legacy-file.json"), JSON.stringify(raw));
    const loaded = await loadSystem("legacy-file");
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.name).toBe("legacy-file");
  });

  it("returns null for a missing system rather than throwing", async () => {
    expect(await loadSystem("does-not-exist")).toBeNull();
  });

  it("returns null for an invalid (whitespace) name without touching disk", async () => {
    expect(await loadSystem("   ")).toBeNull();
  });

  it("lists saved systems sorted by filename", async () => {
    await saveSystem(sampleDs("zeta"));
    await saveSystem(sampleDs("alpha"));
    const names = (await listSystems()).map((s) => s.name);
    expect(names).toEqual(["alpha", "zeta"]);
  });

  it("returns an empty array when no systems directory exists yet", async () => {
    // beforeEach gives every test a fresh temp dir — nothing has been saved here yet.
    expect(await listSystems()).toEqual([]);
  });

  it("BUG (documented, not fixed here): one corrupted system file makes listSystems return [] for every system, not just the bad one", async () => {
    await saveSystem(sampleDs("good-one"));
    const systemsDir = join(dir, ".config", "kernic", "systems");
    await writeFile(join(systemsDir, "corrupted.json"), "{ not valid json");
    // Promise.all over the JSON.parse calls rejects on the first bad file,
    // and the outer catch swallows it down to [] — losing "good-one" too.
    expect(await listSystems()).toEqual([]);
  });

  it("deletes an existing system and returns true", async () => {
    await saveSystem(sampleDs("to-delete"));
    expect(await deleteSystem("to-delete")).toBe(true);
    expect(await loadSystem("to-delete")).toBeNull();
  });

  it("returns false deleting a system that doesn't exist", async () => {
    expect(await deleteSystem("never-existed")).toBe(false);
  });

  it("returns false for an invalid name without creating the config directory", async () => {
    expect(await deleteSystem("   ")).toBe(false);
    // No prior saveSystem/loadSystem call in this test, so if deleteSystem had
    // touched the filesystem it would be the first thing to create .config/kernic.
    await expect(readdir(join(dir, ".config"))).rejects.toThrow();
  });

  it("saves concurrent, differently-named systems without interleaving", async () => {
    await Promise.all([saveSystem(sampleDs("concurrent-a")), saveSystem(sampleDs("concurrent-b"))]);
    expect((await loadSystem("concurrent-a"))?.name).toBe("concurrent-a");
    expect((await loadSystem("concurrent-b"))?.name).toBe("concurrent-b");
  });
});

describe("migrateLegacy (exercised via configDir)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kernic-migrate-test-"));
    process.env.KERNIC_HOME_DIR = dir;
    vi.resetModules(); // fresh module instance -> fresh `migrated` flag per test
  });
  afterEach(async () => {
    delete process.env.KERNIC_HOME_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("auto-creates the config and systems directories when nothing exists yet", async () => {
    const { configDir, systemsDir } = await import("./storage.ts");
    const cfg = await configDir();
    const sys = await systemsDir();
    expect(cfg).toBe(join(dir, ".config", "kernic"));
    expect(sys).toBe(join(dir, ".config", "kernic", "systems"));
    await expect(readdir(sys)).resolves.toEqual([]);
  });

  it("migrates systems and fonts-cache.json out of a legacy dsforge directory", async () => {
    const legacySystems = join(dir, ".config", "dsforge", "systems");
    await mkdir(legacySystems, { recursive: true });
    await writeFile(join(legacySystems, "foo.json"), JSON.stringify(sampleDs("foo")));
    await writeFile(join(dir, ".config", "dsforge", "fonts-cache.json"), "{}");

    const { configDir } = await import("./storage.ts");
    await configDir();

    await expect(readdir(join(dir, ".config", "kernic", "systems"))).resolves.toContain("foo.json");
    await expect(readdir(join(dir, ".config", "kernic"))).resolves.toContain("fonts-cache.json");
    await expect(readdir(join(dir, ".config"))).resolves.not.toContain("dsforge");
  });

  it("processes both dsforge and umbrik legacy directories", async () => {
    for (const legacyName of ["dsforge", "umbrik"]) {
      const legacySystems = join(dir, ".config", legacyName, "systems");
      await mkdir(legacySystems, { recursive: true });
      await writeFile(join(legacySystems, `${legacyName}-file.json`), JSON.stringify(sampleDs(legacyName)));
    }

    const { configDir } = await import("./storage.ts");
    await configDir();

    // dsforge (processed first) migrates in; umbrik's systemsDir already has
    // dsforge's migrated file by the time umbrik is checked, so umbrik's own
    // migration is skipped (existing.length > 0) — documenting real ordering.
    const migratedFiles = await readdir(join(dir, ".config", "kernic", "systems"));
    expect(migratedFiles).toContain("dsforge-file.json");
  });

  it("only runs the migration body once per module instance (idempotent within a process)", async () => {
    const { systemsDir } = await import("./storage.ts");
    await systemsDir(); // first call — creates .config/kernic/systems, flips `migrated` to true

    // Create a legacy dir *after* the first call — since `migrated` is now
    // true for this module instance, a second call must not pick it up.
    const legacySystems = join(dir, ".config", "dsforge", "systems");
    await mkdir(legacySystems, { recursive: true });
    await writeFile(join(legacySystems, "late.json"), JSON.stringify(sampleDs("late")));

    await systemsDir();
    await expect(readdir(join(dir, ".config", "kernic", "systems"))).resolves.not.toContain("late.json");
  });

  it("BUG (documented, not fixed here): deletes the legacy dir even when migration is skipped because target systems already exist", async () => {
    // Pre-populate the real kernic systems dir so migration's `existing.length === 0` guard is false.
    await mkdir(join(dir, ".config", "kernic", "systems"), { recursive: true });
    await writeFile(join(dir, ".config", "kernic", "systems", "existing.json"), JSON.stringify(sampleDs("existing")));

    const legacySystems = join(dir, ".config", "dsforge", "systems");
    await mkdir(legacySystems, { recursive: true });
    await writeFile(join(legacySystems, "unmigrated.json"), JSON.stringify(sampleDs("unmigrated")));

    const { configDir } = await import("./storage.ts");
    await configDir();

    // "unmigrated" was never copied over (skipped, since existing systems were present)...
    await expect(readdir(join(dir, ".config", "kernic", "systems"))).resolves.not.toContain("unmigrated.json");
    // ...yet the legacy dsforge directory was deleted anyway, taking "unmigrated" with it.
    await expect(readdir(join(dir, ".config"))).resolves.not.toContain("dsforge");
  });
});
