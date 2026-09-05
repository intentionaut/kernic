#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import * as p from "@clack/prompts";
import { buildFromVibe } from "./build.ts";
import { agentRuleLines } from "./context.ts";
import {
  FORMAT_LIST,
  contextArtifacts,
  exportArtifacts,
  planArtifacts,
  renderExport,
  writeArtifacts,
  type Artifact,
} from "./export.ts";
import { getFontCatalog } from "./fonts.ts";
import {
  checkProjects,
  claimNotice,
  driftFingerprint,
  driftNote,
  multiProjectFingerprint,
  multiProjectNote,
  muteNotices,
  recordApplication,
  type ProjectStatus,
} from "./projects.ts";
import { SHADCN_FILE } from "./shadcn.ts";
import { renderPalette } from "./swatch.ts";
import { deleteSystem, listSystems, loadSystem, normalizeName, saveSystem } from "./storage.ts";
import { VIBES } from "./vibes.ts";
import { runWizard } from "./wizard.ts";

/**
 * Tell the user which of their own files kernic refused to overwrite. Silence
 * here would be data loss: `tokens.json` is also Style Dictionary's and Tokens
 * Studio's filename, so a project can easily already own one.
 */
function reportBlocked(blocked: readonly string[]): void {
  if (blocked.length === 0) return;
  p.log.warn(
    `Left alone — kernic did not write ${blocked.length === 1 ? "this file" : "these files"}: ${blocked.join(", ")}\n` +
      "Move or rename them first, or pass --force to replace them."
  );
}

/** Print an error and stop. Typed `never` so callers narrow correctly after it. */
function fail(message: string): never {
  p.log.error(message);
  process.exit(1);
}

/** The version actually installed, rather than a literal that goes stale on every release. */
function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
    if (typeof pkg.version === "string" && pkg.version.length > 0) return pkg.version;
  } catch {
    /* fall through */
  }
  return "0.0.0";
}

const program = new Command();

program
  .name("kernic")
  .description("Professional design for vibe coders: a polished design system: palettes, Google Fonts, vibes. Export CSS vars, Tailwind v4, JSON tokens.")
  .version(packageVersion());

// Default action = Studio (the visual editor)
program.action(async () => {
  const { startStudio } = await import("./studio/server.ts");
  p.intro("kernic — professional design for vibe coders");
  p.log.message("Opening Studio in your browser. Prefer the terminal? Run `kernic wizard`.");
  await startStudio(undefined, { open: true });
});

program
  .command("wizard")
  .description("Walk through setup in the terminal (the original text UI)")
  .argument("[name]", "name for the design system")
  .action(async (name?: string) => {
    await runWizard(name);
  });

program
  .command("create")
  .description("Interactively forge a new design system (or use --vibe for a quick start)")
  .argument("[name]", "name for the design system")
  .option("--vibe <id>", `skip prompts with a preset vibe (${VIBES.map((v) => v.id).join(", ")})`)
  .option("--yes", "save without confirmation (with --vibe)")
  .action(async (name: string | undefined, opts: { vibe?: string; yes?: boolean }) => {
    if (!opts.vibe) {
      await runWizard(name);
      return;
    }
    const vibe = VIBES.find((v) => v.id === opts.vibe);
    if (!vibe) {
      p.log.error(`Unknown vibe "${opts.vibe}". Available: ${VIBES.map((v) => v.id).join(", ")}`);
      process.exit(1);
    }
    const normalizedName = normalizeName(name ?? `${opts.vibe}-${Date.now().toString(36).slice(-4)}`);
    if (!normalizedName) {
      p.log.error("Invalid name.");
      process.exit(1);
    }
    if (await loadSystem(normalizedName)) {
      p.log.error(`"${normalizedName}" already exists. Pick another name.`);
      process.exit(1);
    }
    const ds = buildFromVibe(normalizedName, vibe);
    await saveSystem(ds);
    p.outro(`Saved "${normalizedName}" (${vibe.label}). Try: kernic show ${normalizedName}`);
  });

program
  .command("list")
  .alias("ls")
  .description("List saved design systems")
  .action(async () => {
    const systems = await listSystems();
    if (systems.length === 0) {
      p.log.message("No design systems yet. Run `kernic` to open Studio.");
      return;
    }
    p.log.message(
      systems
        .map((s) => {
          const date = s.createdAt.slice(0, 10);
          return `  ${s.name.padEnd(24)} ${s.vibe.padEnd(16)} ${s.fonts.heading} / ${s.fonts.body}  (${date})`;
        })
        .join("\n")
    );
  });

program
  .command("show")
  .description("Show a design system's full spec")
  .argument("<name>")
  .action(async (name: string) => {
    const ds = await loadSystem(name);
    if (!ds) {
      p.log.error(`Not found: "${name}". Try \`kernic list\`.`);
      process.exit(1);
    }
    p.intro(`${ds.name} — vibe: ${ds.vibe}`);
    p.note(renderPalette(ds.colors), "Palette");
    p.log.message(
      [
        "",
        `Fonts     heading ${ds.fonts.heading}`,
        `          body    ${ds.fonts.body}`,
        `          mono    ${ds.fonts.mono}`,
        `Radius    ${ds.radius.style} — sm ${ds.radius.sm} · md ${ds.radius.md} · lg ${ds.radius.lg} · xl ${ds.radius.xl}`,
        `Type      base ${ds.typeScale.baseRem}rem × ratio ${ds.typeScale.ratio}`,
        `Semantic  bg ${ds.semantic.background.light}/${ds.semantic.background.dark}`,
        `          text ${ds.semantic.text.light}/${ds.semantic.text.dark}`,
      ].join("\n")
    );
  });

program
  .command("palette")
  .alias("colors")
  .description("Print color swatches to the terminal")
  .argument("<name>")
  .action(async (name: string) => {
    const ds = await loadSystem(name);
    if (!ds) {
      p.log.error(`Not found: "${name}". Try \`kernic list\`.`);
      process.exit(1);
    }
    console.log(renderPalette(ds.colors));
  });

program
  .command("export")
  .description("Export a design system (stdout by default)")
  .argument("<name>")
  .option("-f, --format <format>", FORMAT_LIST, "css")
  .option("-o, --out <dir>", "write to files in this directory instead of stdout")
  .option("--force", "replace files in that directory even if kernic did not write them")
  .action(async (name: string, opts: { format: string; out?: string; force?: boolean }) => {
    const ds = await loadSystem(name);
    if (!ds) fail(`Not found: "${name}". Try \`kernic list\`.`);

    if (opts.format === "all" && !opts.out) {
      fail("--format all writes multiple files; pass -o <dir> (e.g. -o ./design-system)");
    }

    if (!opts.out) {
      let out: string;
      try {
        out = renderExport(ds, opts.format);
      } catch (err: any) {
        fail(err?.message ?? String(err));
      }
      process.stdout.write(out);
      return;
    }

    let artifacts: Artifact[];
    try {
      artifacts = exportArtifacts(ds, opts.format);
    } catch (err: any) {
      fail(err?.message ?? String(err));
    }
    const dir = resolve(opts.out);
    const plan = await planArtifacts(dir, artifacts, { force: opts.force });
    for (const path of await writeArtifacts(dir, plan.toWrite)) p.log.step(`Wrote ${path}`);
    reportBlocked(plan.blocked);
  });

program
  .command("studio")
  .description("Open the visual Studio in your browser (the default experience, local and free)")
  .argument("[name]", "edit an existing system")
  .option("--no-open", "don't launch the browser automatically")
  .action(async (name: string | undefined, opts: { open: boolean }) => {
    const { startStudio } = await import("./studio/server.ts");
    if (name && !(await loadSystem(name))) {
      p.log.error(`Not found: "${name}". Try \`kernic list\`.`);
      process.exit(1);
    }
    await startStudio(name, { open: opts.open });
  });

program
  .command("delete")
  .alias("rm")
  .description("Delete a saved design system")
  .argument("<name>")
  .action(async (name: string) => {
    const ds = await loadSystem(name);
    if (!ds) {
      p.log.error(`Not found: "${name}".`);
      process.exit(1);
    }
    const ok = await p.confirm({ message: `Delete "${ds.name}"?`, initialValue: false });
    if (p.isCancel(ok) || !ok) return;
    await deleteSystem(name);
    p.outro(`Deleted "${ds.name}".`);
  });

program
  .command("context")
  .description("Write DESIGN.md, W3C tokens.json and a shadcn registry item into a project")
  .argument("<name>")
  .option("-o, --out <dir>", "target directory", ".")
  .option("--no-shadcn", "skip shadcn.json (for projects that do not use shadcn)")
  .option("--force", "replace files in that directory even if kernic did not write them")
  .action(async (name: string, opts: { out: string; shadcn: boolean; force?: boolean }) => {
    const ds = await loadSystem(name);
    if (!ds) fail(`Not found: "${name}". Try \`kernic list\`.`);

    // Same shared code path the MCP apply_to_project tool uses, so the two can
    // never write a different set of files.
    const dir = resolve(opts.out);
    const exclude = opts.shadcn === false ? [SHADCN_FILE] : [];
    const plan = await planArtifacts(dir, contextArtifacts(ds, [], exclude), { force: opts.force });
    const artifacts = plan.toWrite;
    for (const file of await writeArtifacts(dir, artifacts)) p.log.step(`Wrote ${file}`);
    reportBlocked(plan.blocked);

    p.note(
      [
        "Point your AI agent at it:",
        "",
        "  # AGENTS.md / CLAUDE.md / .cursorrules",
        ...agentRuleLines(ds).map((line) => `  ${line}`),
        "",
        "  # or let agents read it live via MCP:",
        "  claude mcp add kernic -- npx kernic mcp",
      ].join("\n"),
      "Design context ready"
    );

    const applied = await recordApplication({ projectPath: dir, system: ds.name, artifacts });
    if (applied.isNewProject && applied.projectCount >= 2) {
      if (await claimNotice(multiProjectFingerprint(applied.projectCount))) {
        p.log.message(multiProjectNote(applied.projectCount, ds.name));
      }
    }
  });

program
  .command("apps")
  .description("Your design systems across every project you've applied them to, and what's fallen behind")
  .option("--mute", "stop showing the note about holding one identity across apps")
  .action(async (opts: { mute?: boolean }) => {
    if (opts.mute) {
      await muteNotices();
      p.log.message("Won't mention that again. (KERNIC_NO_UPSELL=1 does the same for one shell.)");
      return;
    }

    const statuses = await checkProjects();
    if (statuses.length === 0) {
      p.intro("kernic apps");
      p.log.message(
        [
          "No projects yet.",
          "",
          "  kernic context <name> -o ./my-app    # writes DESIGN.md, tokens.json and shadcn.json there",
          "",
          "Anything you apply a system to shows up here.",
        ].join("\n")
      );
      return;
    }

    const bySystem = new Map<string, ProjectStatus[]>();
    for (const status of statuses) {
      const list = bySystem.get(status.record.system) ?? [];
      list.push(status);
      bySystem.set(status.record.system, list);
    }

    const appCount = new Set(statuses.map((s) => s.record.path)).size;
    p.intro(
      `Your design across ${appCount} ${appCount === 1 ? "app" : "apps"} · ${bySystem.size} ${bySystem.size === 1 ? "system" : "systems"}`
    );

    const label: Record<ProjectStatus["state"], string> = {
      current: "matches the system",
      stale: "older version of the system",
      "system-missing": "system no longer saved",
      unreachable: "folder not reachable right now",
    };

    for (const [system, group] of bySystem) {
      const lines = [`${system} — ${group.length} ${group.length === 1 ? "app" : "apps"}`];
      for (const status of group) {
        const mark = status.state === "current" ? "·" : "→";
        lines.push(
          `  ${mark} ${status.record.path}`,
          `      applied ${status.record.appliedAt.slice(0, 10)} — ${label[status.state]}`
        );
      }
      p.log.message(lines.join("\n"));
    }

    const stale = statuses.filter((s) => s.state === "stale");
    if (stale.length === 0) {
      p.outro("Everything matches its system.");
      return;
    }

    // The manual path is the free path, and it should be excellent: every
    // command needed is on screen, ready to paste, in order.
    p.note(stale.flatMap((s) => s.fix).join("\n"), "Bring these back in line");

    if (await claimNotice(driftFingerprint(stale))) {
      p.log.message(driftNote(stale.length));
    }
    p.outro(`${stale.length} of ${appCount} apps out of date.`);
  });

program
  .command("mcp")
  .description("Run kernic as an MCP server (stdio) for Claude Code, Cursor, Windsurf, …")
  .action(async () => {
    const { startMcp } = await import("./mcp.ts");
    await startMcp();
  });

program.parseAsync();
