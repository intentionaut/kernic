import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contextArtifacts } from "./export.ts";
import {
  CLOUD_CTA,
  MUTE_ENV_VAR,
  checkProjects,
  claimNotice,
  driftFingerprint,
  driftNote,
  fixCommands,
  hashArtifacts,
  isProvablyGone,
  listProjects,
  multiProjectFingerprint,
  multiProjectNote,
  muteNotices,
  mutedByEnv,
  projectCount,
  projectsUsing,
  readRegistry,
  recordApplication,
  registryPath,
  unmuteNotices,
  type ProjectRecord,
} from "./projects.ts";
import { deleteSystem, saveSystem } from "./storage.ts";
import { FIXTURE_VIBE_DS } from "./test/fixtures.ts";
import type { DesignSystem } from "./types.ts";

let home: string;
let workspace: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "kernic-projects-home-"));
  workspace = await mkdtemp(join(tmpdir(), "kernic-projects-ws-"));
  process.env.KERNIC_HOME_DIR = home;
  delete process.env[MUTE_ENV_VAR];
});

afterEach(async () => {
  delete process.env.KERNIC_HOME_DIR;
  delete process.env[MUTE_ENV_VAR];
  await rm(home, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

/** Create a real project directory inside the throwaway workspace. */
async function project(name: string): Promise<string> {
  const dir = join(workspace, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function corruptRegistry(content: string): Promise<void> {
  await writeFile(await registryPath(), content, "utf8");
}

describe("hashArtifacts", () => {
  it("is stable for the same content", () => {
    const artifacts = [{ file: "a.md", content: "x" }];
    expect(hashArtifacts(artifacts)).toBe(hashArtifacts(artifacts));
  });

  it("ignores the order artifacts arrive in", () => {
    const a = { file: "a.md", content: "one" };
    const b = { file: "b.json", content: "two" };
    expect(hashArtifacts([a, b])).toBe(hashArtifacts([b, a]));
  });

  it("changes when content changes", () => {
    expect(hashArtifacts([{ file: "a.md", content: "one" }])).not.toBe(
      hashArtifacts([{ file: "a.md", content: "two" }])
    );
  });

  it("changes when the same content lands under a different filename", () => {
    expect(hashArtifacts([{ file: "a.md", content: "x" }])).not.toBe(
      hashArtifacts([{ file: "b.md", content: "x" }])
    );
  });

  it("cannot be fooled by moving the separator into the content", () => {
    expect(hashArtifacts([{ file: "a", content: "b\0c" }])).not.toBe(
      hashArtifacts([{ file: "a\0b", content: "c" }])
    );
  });
});

describe("readRegistry degrades instead of throwing", () => {
  it("returns an empty registry when the file does not exist", async () => {
    await expect(readRegistry()).resolves.toEqual({ version: 1, muted: false, shown: [], projects: [] });
  });

  it("returns an empty registry for unparseable JSON", async () => {
    await corruptRegistry("{ this is not json");
    await expect(readRegistry()).resolves.toMatchObject({ projects: [] });
  });

  it("returns an empty registry when the file is valid JSON of the wrong shape", async () => {
    await corruptRegistry(JSON.stringify(["not", "an", "object"]));
    await expect(readRegistry()).resolves.toMatchObject({ projects: [] });
  });

  it("returns an empty registry for a JSON null", async () => {
    await corruptRegistry("null");
    await expect(readRegistry()).resolves.toMatchObject({ projects: [] });
  });

  it("drops only the malformed entries, keeping the readable ones", async () => {
    const good: ProjectRecord = { path: "/tmp/good", system: "s", appliedAt: "2024-01-01", hash: "h", files: ["design.md"] };
    await corruptRegistry(
      JSON.stringify({ version: 1, projects: [good, { path: 42 }, null, { system: "no-path" }, "nope"] })
    );
    const registry = await readRegistry();
    expect(registry.projects).toEqual([good]);
  });

  it("lets listProjects survive a corrupt registry rather than failing a caller", async () => {
    await corruptRegistry("}}}");
    await expect(listProjects()).resolves.toEqual([]);
    await expect(projectCount()).resolves.toBe(0);
    await expect(checkProjects()).resolves.toEqual([]);
  });

  it("still records a new application after a corrupt read wiped the file", async () => {
    await corruptRegistry("not json at all");
    const dir = await project("app");
    const result = await recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: "x" }] });
    expect(result.projectCount).toBe(1);
    expect((await listProjects()).map((r) => r.path)).toEqual([dir]);
  });
});

describe("recordApplication", () => {
  it("records the path, system, files and a content hash", async () => {
    const dir = await project("app");
    const artifacts = contextArtifacts(FIXTURE_VIBE_DS);
    const { record } = await recordApplication({
      projectPath: dir,
      system: FIXTURE_VIBE_DS.name,
      artifacts,
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(record).toEqual({
      path: dir,
      system: FIXTURE_VIBE_DS.name,
      appliedAt: "2026-01-01T00:00:00.000Z",
      hash: hashArtifacts(artifacts),
      files: ["design.md", "tokens.json"],
    });
  });

  it("reports the first project as new, with a count of one", async () => {
    const result = await recordApplication({
      projectPath: await project("one"),
      system: "s",
      artifacts: [{ file: "design.md", content: "a" }],
    });
    expect(result).toMatchObject({ isNewProject: true, projectCount: 1 });
  });

  it("reports the second distinct project as new, with a count of two", async () => {
    await recordApplication({ projectPath: await project("one"), system: "s", artifacts: [{ file: "design.md", content: "a" }] });
    const second = await recordApplication({
      projectPath: await project("two"),
      system: "s",
      artifacts: [{ file: "design.md", content: "a" }],
    });
    expect(second).toMatchObject({ isNewProject: true, projectCount: 2 });
  });

  it("re-applying to a known project is not a new project and does not grow the count", async () => {
    const dir = await project("one");
    await recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: "a" }] });
    const again = await recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: "b" }] });
    expect(again).toMatchObject({ isNewProject: false, projectCount: 1 });
    expect(await listProjects()).toHaveLength(1);
  });

  it("refreshes the existing entry in place rather than appending a duplicate", async () => {
    const dir = await project("one");
    await recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: "a" }], now: "2020-01-01" });
    await recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: "b" }], now: "2026-01-01" });
    const records = await listProjects();
    expect(records).toHaveLength(1);
    expect(records[0].appliedAt).toBe("2026-01-01");
    expect(records[0].hash).toBe(hashArtifacts([{ file: "design.md", content: "b" }]));
  });

  it("keeps both entries when one project genuinely uses two systems", async () => {
    const dir = await project("one");
    await recordApplication({ projectPath: dir, system: "alpha", artifacts: [{ file: "design.md", content: "a" }] });
    const second = await recordApplication({ projectPath: dir, system: "beta", artifacts: [{ file: "design.md", content: "b" }] });
    expect(second).toMatchObject({ isNewProject: false, projectCount: 1 });
    expect(await listProjects()).toHaveLength(2);
  });

  it("does not clobber concurrent writers", async () => {
    const dirs = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => project(`app-${n}`)));
    await Promise.all(
      dirs.map((dir) => recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: dir }] }))
    );
    const recorded = (await listProjects()).map((r) => r.path).sort();
    expect(recorded).toEqual([...dirs].sort());
  });

  it("writes the registry to ~/.config/kernic/projects.json", async () => {
    const dir = await project("app");
    await recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: "a" }] });
    expect(await registryPath()).toBe(join(home, ".config", "kernic", "projects.json"));
    const raw = JSON.parse(await readFile(await registryPath(), "utf8"));
    expect(raw.projects[0].path).toBe(dir);
  });
});

describe("projectsUsing", () => {
  it("returns only the projects on that system", async () => {
    await recordApplication({ projectPath: await project("a"), system: "alpha", artifacts: [{ file: "design.md", content: "x" }] });
    await recordApplication({ projectPath: await project("b"), system: "beta", artifacts: [{ file: "design.md", content: "x" }] });
    expect((await projectsUsing("alpha")).map((r) => r.system)).toEqual(["alpha"]);
    expect(await projectsUsing("gamma")).toEqual([]);
  });
});

describe("pruning", () => {
  it("prunes an entry whose project directory was deleted from a readable parent", async () => {
    const dir = await project("gone");
    await recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: "x" }] });
    await rm(dir, { recursive: true, force: true });
    expect(await isProvablyGone(dir)).toBe(true);
    expect(await listProjects()).toEqual([]);
  });

  it("persists the prune so it does not have to be recomputed", async () => {
    const dir = await project("gone");
    await recordApplication({ projectPath: dir, system: "s", artifacts: [{ file: "design.md", content: "x" }] });
    await rm(dir, { recursive: true, force: true });
    await listProjects();
    expect((await readRegistry()).projects).toEqual([]);
  });

  it("keeps an entry when the parent directory is unreadable — an unmounted drive is not a deletion", async () => {
    const unmounted = join(workspace, "not-mounted", "my-app");
    await recordApplication({ projectPath: unmounted, system: "s", artifacts: [{ file: "design.md", content: "x" }] });
    expect(await isProvablyGone(unmounted)).toBe(false);
    expect((await listProjects()).map((r) => r.path)).toEqual([unmounted]);
  });

  it("never prunes a path whose parent is itself (a filesystem root)", async () => {
    expect(await isProvablyGone("/")).toBe(false);
  });

  it("leaves surviving projects alone while pruning a deleted sibling", async () => {
    const alive = await project("alive");
    const dead = await project("dead");
    await recordApplication({ projectPath: alive, system: "s", artifacts: [{ file: "design.md", content: "x" }] });
    await recordApplication({ projectPath: dead, system: "s", artifacts: [{ file: "design.md", content: "x" }] });
    await rm(dead, { recursive: true, force: true });
    expect((await listProjects()).map((r) => r.path)).toEqual([alive]);
  });
});

describe("checkProjects", () => {
  async function applyFixture(dirName: string): Promise<string> {
    const dir = await project(dirName);
    await saveSystem(FIXTURE_VIBE_DS);
    await recordApplication({
      projectPath: dir,
      system: FIXTURE_VIBE_DS.name,
      artifacts: contextArtifacts(FIXTURE_VIBE_DS),
    });
    return dir;
  }

  it("reports a project as current when the system has not changed", async () => {
    await applyFixture("app");
    expect((await checkProjects()).map((s) => s.state)).toEqual(["current"]);
  });

  it("reports a project as stale once the system changes", async () => {
    await applyFixture("app");
    const changed: DesignSystem = { ...FIXTURE_VIBE_DS, fonts: { ...FIXTURE_VIBE_DS.fonts, heading: "Fraunces" } };
    await saveSystem(changed);
    expect((await checkProjects()).map((s) => s.state)).toEqual(["stale"]);
  });

  it("reports system-missing when the design system was deleted", async () => {
    await applyFixture("app");
    await deleteSystem(FIXTURE_VIBE_DS.name);
    expect((await checkProjects()).map((s) => s.state)).toEqual(["system-missing"]);
  });

  it("reports unreachable when the project folder cannot be seen and was not provably deleted", async () => {
    const unmounted = join(workspace, "not-mounted", "my-app");
    await saveSystem(FIXTURE_VIBE_DS);
    await recordApplication({
      projectPath: unmounted,
      system: FIXTURE_VIBE_DS.name,
      artifacts: contextArtifacts(FIXTURE_VIBE_DS),
    });
    expect((await checkProjects()).map((s) => s.state)).toEqual(["unreachable"]);
  });

  it("does not cry drift over a filename it cannot regenerate", async () => {
    const dir = await project("app");
    await saveSystem(FIXTURE_VIBE_DS);
    await recordApplication({
      projectPath: dir,
      system: FIXTURE_VIBE_DS.name,
      artifacts: [{ file: "something-else.txt", content: "whatever" }],
    });
    expect((await checkProjects()).map((s) => s.state)).toEqual(["current"]);
  });

  it("attaches copy-ready fix commands to every status", async () => {
    const dir = await applyFixture("app");
    const [status] = await checkProjects();
    expect(status.fix).toEqual([`kernic context ${FIXTURE_VIBE_DS.name} -o ${dir}`]);
  });
});

describe("fixCommands", () => {
  const base: ProjectRecord = { path: "/tmp/app", system: "acme", appliedAt: "2026-01-01", hash: "h", files: [] };

  it("uses kernic context for the design.md + tokens.json pair", () => {
    expect(fixCommands({ ...base, files: ["design.md", "tokens.json"] })).toEqual(["kernic context acme -o /tmp/app"]);
  });

  it("adds one export command per extra stylesheet that was written", () => {
    expect(fixCommands({ ...base, files: ["design.md", "tokens.json", "tokens.css", "tailwind.css"] })).toEqual([
      "kernic context acme -o /tmp/app",
      "kernic export acme -f css -o /tmp/app",
      "kernic export acme -f tailwind -o /tmp/app",
    ]);
  });

  it("quotes paths and names containing spaces so the command pastes cleanly", () => {
    const cmds = fixCommands({ ...base, path: "/tmp/my app", system: "my system", files: ["design.md"] });
    expect(cmds).toEqual([`kernic context "my system" -o "/tmp/my app"`]);
  });

  it("always returns at least one runnable command", () => {
    expect(fixCommands(base)).toEqual(["kernic context acme -o /tmp/app"]);
  });
});

describe("the portfolio note", () => {
  it("has no product name, price, URL or date — the cloud tier does not exist yet", () => {
    expect(CLOUD_CTA).toBe("");
    for (const copy of [multiProjectNote(3, "acme"), driftNote(2)]) {
      expect(copy).not.toMatch(/https?:\/\//);
      expect(copy).not.toMatch(/[$£€]\s?\d/);
      expect(copy).not.toMatch(/\b(pro|premium|cloud|team|plan|pricing|upgrade|subscribe|trial|beta|waitlist)\b/i);
      expect(copy).not.toMatch(/\b20\d\d\b/);
    }
  });

  it("says the true thing: kernic only updates the project you run it in", () => {
    const copy = multiProjectNote(3, "acme");
    expect(copy).toContain("acme");
    expect(copy).toContain("3 projects");
    expect(copy).toMatch(/manual/i);
    expect(copy).toContain("kernic apps");
  });

  it("frames drift as identity, and points at the commands rather than at a paywall", () => {
    expect(driftNote(2)).toContain("2 apps are");
    expect(driftNote(1)).toContain("1 app is");
    expect(driftNote(2)).toMatch(/commands above/i);
  });

  it("appends nothing while the call to action placeholder is empty", () => {
    expect(multiProjectNote(2, "acme").trimEnd()).toBe(multiProjectNote(2, "acme"));
  });
});

describe("claimNotice", () => {
  it("fires exactly once for the same event", async () => {
    const fingerprint = multiProjectFingerprint(2);
    expect(await claimNotice(fingerprint)).toBe(true);
    expect(await claimNotice(fingerprint)).toBe(false);
    expect(await claimNotice(fingerprint)).toBe(false);
  });

  it("fires again for a genuinely different event", async () => {
    expect(await claimNotice(multiProjectFingerprint(2))).toBe(true);
    expect(await claimNotice(multiProjectFingerprint(3))).toBe(true);
  });

  it("never fires when muted by the environment", async () => {
    process.env[MUTE_ENV_VAR] = "1";
    expect(mutedByEnv()).toBe(true);
    expect(await claimNotice("multi:2")).toBe(false);
  });

  it("never fires when muted in the config, and resumes if unmuted", async () => {
    await muteNotices();
    expect(await claimNotice("multi:2")).toBe(false);
    await unmuteNotices();
    expect(await claimNotice("multi:2")).toBe(true);
  });

  it("treats an empty, 0 or false env value as not muted", () => {
    for (const value of ["", "0", "false", "FALSE", "  "]) {
      process.env[MUTE_ENV_VAR] = value;
      expect(mutedByEnv()).toBe(false);
    }
    for (const value of ["1", "true", "yes"]) {
      process.env[MUTE_ENV_VAR] = value;
      expect(mutedByEnv()).toBe(true);
    }
  });

  it("survives a corrupt registry by simply not claiming twice", async () => {
    expect(await claimNotice("multi:2")).toBe(true);
    expect(await claimNotice("multi:2")).toBe(false);
  });
});

describe("driftFingerprint", () => {
  const status = (path: string, hash: string) => ({
    record: { path, system: "s", appliedAt: "2026-01-01", hash, files: [] },
    state: "stale" as const,
    fix: [],
  });

  it("is the same for the same set of stale projects, in any order", () => {
    const a = status("/a", "h1");
    const b = status("/b", "h2");
    expect(driftFingerprint([a, b])).toBe(driftFingerprint([b, a]));
  });

  it("changes when a different project drifts", () => {
    expect(driftFingerprint([status("/a", "h1")])).not.toBe(driftFingerprint([status("/b", "h1")]));
  });

  it("changes when the same project is re-applied and drifts again", () => {
    expect(driftFingerprint([status("/a", "h1")])).not.toBe(driftFingerprint([status("/a", "h2")]));
  });
});

describe("the second-project trigger", () => {
  /** Mirrors what apply_to_project and `kernic context` do after a write. */
  async function applyAndMaybeNotify(dir: string, system: string): Promise<string | null> {
    const result = await recordApplication({ projectPath: dir, system, artifacts: [{ file: "design.md", content: dir }] });
    if (!result.isNewProject || result.projectCount < 2) return null;
    return (await claimNotice(multiProjectFingerprint(result.projectCount)))
      ? multiProjectNote(result.projectCount, system)
      : null;
  }

  it("says nothing on the first project", async () => {
    expect(await applyAndMaybeNotify(await project("one"), "acme")).toBeNull();
  });

  it("fires on the second project, and never again for that same event", async () => {
    await applyAndMaybeNotify(await project("one"), "acme");
    const two = await project("two");
    expect(await applyAndMaybeNotify(two, "acme")).toContain("2 projects");
    // Re-applying to the same project is not a new event.
    expect(await applyAndMaybeNotify(two, "acme")).toBeNull();
  });

  it("fires once more at a third project, because that is a different event", async () => {
    await applyAndMaybeNotify(await project("one"), "acme");
    await applyAndMaybeNotify(await project("two"), "acme");
    expect(await applyAndMaybeNotify(await project("three"), "acme")).toContain("3 projects");
  });

  it("stays silent throughout when the user has opted out", async () => {
    process.env[MUTE_ENV_VAR] = "1";
    await applyAndMaybeNotify(await project("one"), "acme");
    expect(await applyAndMaybeNotify(await project("two"), "acme")).toBeNull();
    expect(await applyAndMaybeNotify(await project("three"), "acme")).toBeNull();
  });
});
