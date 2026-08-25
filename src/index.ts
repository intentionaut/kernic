#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Command } from "commander";
import * as p from "@clack/prompts";
import { buildFromVibe } from "./build.ts";
import { exportCss, exportFonts, exportTailwind } from "./export.ts";
import { getFontCatalog } from "./fonts.ts";
import { renderPalette } from "./swatch.ts";
import { deleteSystem, listSystems, loadSystem, normalizeName, saveSystem } from "./storage.ts";
import { VIBES } from "./vibes.ts";
import { runWizard } from "./wizard.ts";

const program = new Command();

program
  .name("kernic")
  .description("Kern your whole app: a polished design system: palettes, Google Fonts, vibes. Export CSS vars, Tailwind v4, JSON tokens.")
  .version("0.1.0");

// Default action = wizard
program.action(async () => {
  await runWizard();
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
    p.outro(`Kerned "${normalizedName}" (${vibe.label}). Try: kernic show ${normalizedName}`);
  });

program
  .command("list")
  .alias("ls")
  .description("List saved design systems")
  .action(async () => {
    const systems = await listSystems();
    if (systems.length === 0) {
      p.log.message("No design systems yet. Run `kernic` to start.");
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
  .option("-f, --format <format>", "css | tailwind | json | fonts | all", "css")
  .option("-o, --out <dir>", "write to files in this directory instead of stdout")
  .action(async (name: string, opts: { format: string; out?: string }) => {
    const ds = await loadSystem(name);
    if (!ds) {
      p.log.error(`Not found: "${name}". Try \`kernic list\`.`);
      process.exit(1);
    }

    const formats: Record<string, () => string> = {
      css: () => exportCss(ds),
      tailwind: () => exportTailwind(ds),
      json: () => JSON.stringify(ds, null, 2),
      fonts: () => exportFonts(ds),
    };

    if (opts.format === "all" && !opts.out) {
      p.log.error("--format all writes multiple files; pass -o <dir> (e.g. -o ./design-system)");
      process.exit(1);
    }

    if (!opts.out) {
      const gen = formats[opts.format];
      if (!gen) {
        p.log.error(`Unknown format "${opts.format}". Use css | tailwind | json | fonts | all.`);
        process.exit(1);
      }
      process.stdout.write(gen());
      return;
    }

    // Write files
    const dir = resolve(opts.out);
    await mkdir(dir, { recursive: true });
    const files: [string, string][] =
      opts.format === "all"
        ? [
            ["tokens.css", exportCss(ds)],
            ["tailwind.css", exportTailwind(ds)],
            ["tokens.json", JSON.stringify(ds, null, 2)],
            ["fonts.html", exportFonts(ds)],
          ]
        : [[
            { css: "tokens.css", tailwind: "tailwind.css", json: "tokens.json", fonts: "fonts.html" }[opts.format] ??
              (() => { p.log.error(`Unknown format "${opts.format}".`); process.exit(1); })(),
            (formats[opts.format] ?? (() => ""))(),
          ]];
    for (const [file, content] of files) {
      await writeFile(join(dir, file), content, "utf8");
      p.log.step(`Wrote ${join(dir, file)}`);
    }
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

program.parseAsync();
