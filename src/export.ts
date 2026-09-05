import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DESIGN_MD_FILE, LEGACY_BRIEF_FILE, OWNERSHIP_MARK, designBrief, dtcgTokens, typeScaleEntries } from "./context.ts";
import { fontImportUrl } from "./fonts.ts";
import { SHADCN_FILE, isKernicShadcn, shadcnRegistryItem } from "./shadcn.ts";
import { easeCss, shadowCss } from "./tokens.ts";
import { SHADOW_LEVELS, TYPE_STEPS, type DesignSystem, type Ramp } from "./types.ts";

const varName = (...parts: string[]) => parts.filter(Boolean).join("-");

function colorVars(ds: DesignSystem): string[] {
  const lines: string[] = [];
  for (const [rampName, ramp] of Object.entries(ds.colors)) {
    for (const [stop, hex] of Object.entries(ramp)) {
      lines.push(`  --${varName("color", rampName, stop)}: ${hex};`);
    }
  }
  const semanticKeys = [
    ["background", "background"],
    ["surface", "surface"],
    ["text", "text"],
    ["mutedText", "muted-text"],
    ["border", "border"],
    ["ring", "ring"],
  ] as const;
  lines.push("");
  lines.push("  /* Semantic (light) */");
  for (const [key, css] of semanticKeys) {
    const value = ds.semantic[key];
    const hex = typeof value === "string" ? value : value.light;
    lines.push(`  --${css}: ${hex};`);
  }
  lines.push("");
  lines.push("  /* Semantic (dark) — activate via .dark class or media query below */");
  for (const [key, css] of semanticKeys) {
    const value = ds.semantic[key];
    const hex = typeof value === "string" ? value : value.dark;
    lines.push(`  --dark-${css}: ${hex};`);
  }
  // DESIGN.md's frontmatter promises these three under `colors:` as aliases
  // onto the ramp (colorRef in context.ts). If this export does not also
  // publish them as real custom properties, an agent following DESIGN.md's
  // own instruction ("use only its tokens, never invent raw hex") reaches for
  // var(--primary) and gets nothing: the property is invalid, the declaration
  // it sits in drops silently, and CSS fails asymmetrically (background never
  // paints, border-color falls back to currentColor). See
  // KERNIC-NOTES-FROM-TOME.md #1.
  lines.push("");
  lines.push("  /* Primary & accent aliases — keep in sync with designFrontmatter() in context.ts */");
  lines.push(`  --primary: var(--color-primary-600);`);
  lines.push(`  --primary-hover: var(--color-primary-500);`);
  lines.push(`  --accent: var(--color-accent-500);`);
  if (ds.gradients && Object.keys(ds.gradients).length > 0) {
    lines.push("");
    lines.push("  /* Gradients */");
    for (const [name, value] of Object.entries(ds.gradients)) {
      lines.push(`  --gradient-${name}: ${value};`);
    }
  }
  return lines;
}

function fontVars(ds: DesignSystem): string[] {
  return [
    `  --font-heading: "${ds.fonts.heading}", ui-serif, Georgia, serif;`,
    `  --font-body: "${ds.fonts.body}", ui-sans-serif, system-ui, sans-serif;`,
    `  --font-mono: "${ds.fonts.mono}", ui-monospace, monospace;`,
  ];
}

function radiusVars(ds: DesignSystem): string[] {
  return [
    `  --radius-sm: ${ds.radius.sm};`,
    `  --radius-md: ${ds.radius.md};`,
    `  --radius-lg: ${ds.radius.lg};`,
    `  --radius-xl: ${ds.radius.xl};`,
  ];
}

function spaceVars(ds: DesignSystem): string[] {
  return Object.entries(ds.spacing.scale).map(([k, v]) => `  --space-${k}: ${v};`);
}

function scaleVars(ds: DesignSystem): string[] {
  return typeScaleEntries(ds).map(([name, rem]) => `  --text-${name}: ${rem}rem;`);
}

function typographyVars(ds: DesignSystem): string[] {
  const t = ds.typography;
  return [
    ...TYPE_STEPS.map((s) => `  --leading-${s}: ${t.leading[s]};`),
    ...Object.entries(t.tracking).map(([k, v]) => `  --tracking-${k}: ${v};`),
    ...Object.entries(t.weights).map(([k, v]) => `  --font-weight-${k}: ${v};`),
  ];
}

function shadowVars(ds: DesignSystem, mode: "light" | "dark", prefix = "--shadow-"): string[] {
  return SHADOW_LEVELS.map((l) => `  ${prefix}${l}: ${shadowCss(ds.shadows[l][mode])};`);
}

function motionVars(ds: DesignSystem): string[] {
  return [
    ...Object.entries(ds.motion.duration).map(([k, v]) => `  --duration-${k}: ${v};`),
    `  --ease-out: ${easeCss(ds.motion.ease.out)};`,
    `  --ease-in-out: ${easeCss(ds.motion.ease.inOut)};`,
    `  --ease-emphasized: ${easeCss(ds.motion.ease.emphasized)};`,
  ];
}

function layoutVars(ds: DesignSystem): string[] {
  return [
    ...Object.entries(ds.breakpoints).map(([k, v]) => `  --breakpoint-${k}: ${v};`),
    ...Object.entries(ds.containers)
      .filter(([k]) => k !== "measure")
      .map(([k, v]) => `  --container-${k}: ${v};`),
    `  --measure: ${ds.containers.measure};`,
  ];
}

/** Plain CSS custom properties, ready to paste into a global stylesheet. */
export function exportCss(ds: DesignSystem): string {
  return [
    `/* kernic — "${ds.name}" (vibe: ${ds.vibe}) */`,
    `@import url("${fontImportUrl(ds.fonts.heading)}");`,
    `@import url("${fontImportUrl(ds.fonts.body)}");`,
    `@import url("${fontImportUrl(ds.fonts.mono)}");`,
    "",
    ":root {",
    ...colorVars(ds),
    "",
    "  /* Typography */",
    ...scaleVars(ds),
    ...typographyVars(ds),
    ...fontVars(ds),
    "",
    "  /* Radius & spacing */",
    ...radiusVars(ds),
    `  --spacing: ${ds.spacing.unit};`,
    ...spaceVars(ds),
    "",
    "  /* Shadows (light) — dark values below */",
    ...shadowVars(ds, "light"),
    ...shadowVars(ds, "dark", "--dark-shadow-"),
    "",
    "  /* Motion */",
    ...motionVars(ds),
    "",
    "  /* Layout */",
    ...layoutVars(ds),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root:not(.light) {",
    "    --background: var(--dark-background);",
    "    --surface: var(--dark-surface);",
    "    --text: var(--dark-text);",
    "    --muted-text: var(--dark-muted-text);",
    "    --border: var(--dark-border);",
    ...SHADOW_LEVELS.map((l) => `    --shadow-${l}: var(--dark-shadow-${l});`),
    "  }",
    "}",
    "",
    "@media (prefers-reduced-motion: reduce) {",
    "  :root {",
    "    --duration-fast: 0ms;",
    "    --duration-base: 0ms;",
    "    --duration-slow: 0ms;",
    "  }",
    "}",
    "",
  ].join("\n");
}

/**
 * Tailwind v4 theme. Semantic colours and shadows have a light and a dark
 * value, so they live on `:root` / `.dark` and reach the theme through
 * `@theme inline`, the way shadcn wires its variables. Everything single-valued
 * goes straight into `@theme`.
 */
export function exportTailwind(ds: DesignSystem): string {
  const s = ds.semantic;
  const t = ds.typography;
  const rampVars: string[] = [];
  for (const [rampName, ramp] of Object.entries(ds.colors) as [string, Ramp][]) {
    for (const [stop, hex] of Object.entries(ramp)) {
      rampVars.push(`  --color-${rampName}-${stop}: ${hex};`);
    }
  }
  const gradientVars = Object.entries(ds.gradients ?? {}).map(([name, value]) => `  --background-image-${name}: ${value};`);
  const modeVars = (mode: "light" | "dark") => [
    `  --background: ${s.background[mode]};`,
    `  --surface: ${s.surface[mode]};`,
    `  --foreground: ${s.text[mode]};`,
    `  --muted-foreground: ${s.mutedText[mode]};`,
    `  --border-default: ${s.border[mode]};`,
    `  --ring: ${s.ring};`,
    // See the matching comment in colorVars() above: DESIGN.md promises these
    // as tokens, so every CSS-producing export must publish them for real.
    `  --primary: var(--color-primary-600);`,
    `  --primary-hover: var(--color-primary-500);`,
    `  --accent: var(--color-accent-500);`,
    ...shadowVars(ds, mode, "--shadow-").map((line) => line.replace("--shadow-", "--elevation-")),
  ];
  return [
    `/* kernic — "${ds.name}" Tailwind v4 theme (vibe: ${ds.vibe}) */`,
    `@import "tailwindcss";`,
    `@import url("${fontImportUrl(ds.fonts.heading)}");`,
    `@import url("${fontImportUrl(ds.fonts.body)}");`,
    `@import url("${fontImportUrl(ds.fonts.mono)}");`,
    "",
    "@custom-variant dark (&:where(.dark, .dark *));",
    "",
    ":root {",
    ...modeVars("light"),
    "}",
    "",
    ".dark {",
    ...modeVars("dark"),
    "}",
    "",
    "@theme inline {",
    "  --color-background: var(--background);",
    "  --color-surface: var(--surface);",
    "  --color-foreground: var(--foreground);",
    "  --color-muted: var(--muted-foreground);",
    "  --color-border-default: var(--border-default);",
    "  --color-ring: var(--ring);",
    "  --color-primary: var(--primary);",
    "  --color-primary-hover: var(--primary-hover);",
    "  --color-accent: var(--accent);",
    ...SHADOW_LEVELS.map((l) => `  --shadow-${l}: var(--elevation-${l});`),
    "}",
    "",
    "@theme {",
    ...rampVars,
    ...gradientVars,
    "",
    `  --font-heading: "${ds.fonts.heading}", ui-serif, serif;`,
    `  --font-body: "${ds.fonts.body}", ui-sans-serif, system-ui, sans-serif;`,
    `  --font-mono: "${ds.fonts.mono}", ui-monospace, monospace;`,
    "",
    ...typeScaleEntries(ds).flatMap(([name, rem]) => [
      `  --text-${name}: ${rem}rem;`,
      `  --text-${name}--line-height: ${t.leading[name]};`,
    ]),
    ...Object.entries(t.tracking).map(([k, v]) => `  --tracking-${k}: ${v};`),
    ...Object.entries(t.weights).map(([k, v]) => `  --font-weight-${k}: ${v};`),
    "",
    `  --radius-sm: ${ds.radius.sm};`,
    `  --radius-md: ${ds.radius.md};`,
    `  --radius-lg: ${ds.radius.lg};`,
    `  --radius-xl: ${ds.radius.xl};`,
    "",
    `  --spacing: ${ds.spacing.unit};`,
    ...Object.entries(ds.spacing.scale).map(([k, v]) => `  --spacing-${k}: ${v};`),
    "",
    ...Object.entries(ds.motion.duration).map(([k, v]) => `  --duration-${k}: ${v};`),
    `  --ease-out: ${easeCss(ds.motion.ease.out)};`,
    `  --ease-in-out: ${easeCss(ds.motion.ease.inOut)};`,
    `  --ease-emphasized: ${easeCss(ds.motion.ease.emphasized)};`,
    "",
    ...Object.entries(ds.breakpoints).map(([k, v]) => `  --breakpoint-${k}: ${v};`),
    ...Object.entries(ds.containers)
      .filter(([k]) => k !== "measure")
      .map(([k, v]) => `  --container-${k}: ${v};`),
    "}",
    "",
  ].join("\n");
}

/** HTML <link> tags + @import fallback. */
export function exportFonts(ds: DesignSystem): string {
  const families = [ds.fonts.heading, ds.fonts.body, ds.fonts.mono].filter(
    (f, i, arr) => arr.indexOf(f) === i
  );
  const preconnect = [
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
  ];
  const stylesheets = families.map(
    (f) => `<link href="${fontImportUrl(f)}" rel="stylesheet">`
  );
  const imports = families.map((f) => `@import url("${fontImportUrl(f)}");`);
  return [
    `<!-- kernic — "${ds.name}" Google Fonts -->`,
    ...preconnect,
    ...stylesheets,
    "",
    "/* or in CSS: */",
    ...imports,
    "",
  ].join("\n");
}

/* ────────────────────────── artifact registry ──────────────────────────
 * One place that knows every format, what it renders, and what filename it
 * lands on. `kernic export`, `kernic context`, the MCP apply_to_project tool
 * and the drift check in projects.ts all go through here, so a format added
 * once shows up everywhere instead of in one surface at a time.
 * ---------------------------------------------------------------------- */

export const EXPORT_FORMATS = ["css", "tailwind", "json", "fonts", "dtcg", "design-md", "shadcn"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The exact wording used in --format help and in every "unknown format" error. */
export const FORMAT_LIST = "css | tailwind | json | fonts | dtcg | design-md | shadcn | all";

const RENDERERS: Record<ExportFormat, (ds: DesignSystem) => string> = {
  css: exportCss,
  tailwind: exportTailwind,
  json: (ds) => JSON.stringify(ds, null, 2),
  fonts: exportFonts,
  dtcg: dtcgTokens,
  "design-md": designBrief,
  shadcn: shadcnRegistryItem,
};

/**
 * Filenames used by `kernic export -o <dir>`.
 *
 * `dtcg` deliberately does not claim tokens.json: `-f json` has written the raw
 * kernic system to tokens.json since 0.1.0, and `kernic context` writes the W3C
 * DTCG tokens to tokens.json. Both are published behaviour. Giving the DTCG
 * *export* the distinct tokens.dtcg.json name leaves both untouched.
 */
const EXPORT_FILES: Record<ExportFormat, string> = {
  css: "tokens.css",
  tailwind: "tailwind.css",
  json: "tokens.json",
  fonts: "fonts.html",
  dtcg: "tokens.dtcg.json",
  "design-md": DESIGN_MD_FILE,
  shadcn: SHADCN_FILE,
};

/** What `-f all` writes, in order. */
export const ALL_FORMATS: readonly ExportFormat[] = EXPORT_FORMATS;

export interface Artifact {
  file: string;
  content: string;
}

export function isExportFormat(format: string): format is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(format);
}

function unknownFormat(format: string): Error {
  return new Error(`Unknown format "${format}". Use ${FORMAT_LIST}.`);
}

/** Render one format to a string. Throws with the canonical message on a bad format. */
export function renderExport(ds: DesignSystem, format: string): string {
  if (!isExportFormat(format)) throw unknownFormat(format);
  return RENDERERS[format](ds);
}

/** The filename `kernic export -o <dir>` uses for a format. */
export function exportFileName(format: string): string {
  if (!isExportFormat(format)) throw unknownFormat(format);
  return EXPORT_FILES[format];
}

/** Artifacts for `kernic export`; `format` may be "all". Throws on a bad format. */
export function exportArtifacts(ds: DesignSystem, format: string): Artifact[] {
  const formats = format === "all" ? ALL_FORMATS : [format];
  return formats.map((f) => {
    if (!isExportFormat(f)) throw unknownFormat(f);
    return { file: EXPORT_FILES[f], content: RENDERERS[f](ds) };
  });
}

/**
 * The files `kernic context` and apply_to_project write without being asked:
 * one per standard the ecosystem reads. DESIGN.md for coding agents, W3C DTCG
 * tokens under the tokens.json name `kernic context` has always used, and a
 * shadcn registry item.
 */
export const CONTEXT_FILES = [DESIGN_MD_FILE, "tokens.json", SHADCN_FILE] as const;
export type ContextFile = (typeof CONTEXT_FILES)[number];

/**
 * The context set, minus anything in `exclude`, plus stylesheet `extras`
 * (css / tailwind / fonts) for callers that want ready-to-import styles beside
 * the brief.
 */
export function contextArtifacts(
  ds: DesignSystem,
  extras: readonly ExportFormat[] = [],
  exclude: readonly string[] = []
): Artifact[] {
  const standard: Artifact[] = [
    { file: DESIGN_MD_FILE, content: designBrief(ds) },
    { file: "tokens.json", content: dtcgTokens(ds) },
    { file: SHADCN_FILE, content: shadcnRegistryItem(ds) },
  ];
  const artifacts = standard.filter((a) => !exclude.includes(a.file));
  for (const f of extras) {
    // These would repeat a standard file under a second name and leave the
    // agent unsure which one is authoritative.
    if (f === "design-md" || f === "dtcg" || f === "json" || f === "shadcn") continue;
    const file = EXPORT_FILES[f];
    if (artifacts.some((a) => a.file === file)) continue;
    artifacts.push({ file, content: RENDERERS[f](ds) });
  }
  return artifacts;
}

/**
 * Regenerate a file kernic previously wrote into a project, so drift can be
 * detected by comparing against what the system produces today. Returns null
 * for a filename kernic does not own.
 *
 * tokens.json maps to the DTCG output because the only writers that record
 * into the project registry (`kernic context` and apply_to_project) write DTCG
 * there. `kernic export -f json` also produces a tokens.json, but that path
 * records nothing, so it never reaches this function.
 */
export function renderProjectFile(ds: DesignSystem, file: string): string | null {
  switch (file) {
    case DESIGN_MD_FILE:
    case LEGACY_BRIEF_FILE:
      return designBrief(ds);
    case "tokens.json":
    case "tokens.dtcg.json":
      return dtcgTokens(ds);
    case SHADCN_FILE:
      return shadcnRegistryItem(ds);
    case "tokens.css":
      return exportCss(ds);
    case "tailwind.css":
      return exportTailwind(ds);
    case "fonts.html":
      return exportFonts(ds);
    default:
      return null;
  }
}

/**
 * True when an existing file at this name is one kernic itself produced, and is
 * therefore safe to replace. Every generated artifact carries an identifying
 * marker; anything else is the user's own file and is left alone.
 *
 * `tokens.json` matters most here: it is the name Style Dictionary, Tokens
 * Studio and Figma Tokens all use, so a project can easily already have one
 * that kernic must not destroy.
 */
export function isKernicOwned(file: string, content: string): boolean {
  const head = content.slice(0, 512);
  switch (file) {
    case DESIGN_MD_FILE:
    case LEGACY_BRIEF_FILE:
      return head.includes(OWNERSHIP_MARK);
    case SHADCN_FILE:
      return isKernicShadcn(content);
    case "tokens.json":
    case "tokens.dtcg.json":
      try {
        const parsed = JSON.parse(content) as { $extensions?: Record<string, unknown> } | null;
        return !!parsed && typeof parsed === "object" && !!parsed.$extensions?.["com.kernic"];
      } catch {
        return false;
      }
    case "tokens.css":
    case "tailwind.css":
      return head.startsWith("/* kernic —");
    case "fonts.html":
      return head.startsWith("<!-- kernic —");
    default:
      return false;
  }
}

export interface ArtifactPlan {
  /** Safe to write: absent, an earlier kernic artifact, or force was set. */
  toWrite: Artifact[];
  /** Existed and kernic wrote it — or force replaced someone else's. */
  replaced: string[];
  /** Existed, kernic did not write it, force not set — left untouched. */
  blocked: string[];
}

/**
 * Decide which artifacts may be written into `dir` without destroying a file
 * the user owns. Shared by `kernic context`, `kernic export -o` and the MCP
 * `apply_to_project` tool so all three behave identically — the two CLI paths
 * silently overwrote an unowned tokens.json until this was centralised.
 */
export async function planArtifacts(
  dir: string,
  artifacts: readonly Artifact[],
  opts: { force?: boolean } = {}
): Promise<ArtifactPlan> {
  const plan: ArtifactPlan = { toWrite: [], replaced: [], blocked: [] };
  for (const artifact of artifacts) {
    let existing: string | null;
    try {
      existing = await readFile(join(dir, artifact.file), "utf8");
    } catch {
      existing = null; // absent, or unreadable — writeFile reports the real error
    }
    if (existing !== null) {
      if (isKernicOwned(artifact.file, existing)) {
        plan.replaced.push(artifact.file);
      } else if (opts.force) {
        plan.replaced.push(`${artifact.file} (was not written by kernic)`);
      } else {
        plan.blocked.push(artifact.file);
        continue;
      }
    }
    plan.toWrite.push(artifact);
  }
  return plan;
}

/** Write artifacts into dir (created if missing). Returns the paths written. */
export async function writeArtifacts(dir: string, artifacts: readonly Artifact[]): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const { file, content } of artifacts) {
    const path = join(dir, file);
    await writeFile(path, content, "utf8");
    written.push(path);
  }
  return written;
}

/** Write the context set (DESIGN.md, tokens.json, shadcn.json) into outDir. Returns written paths. */
export async function writeContext(ds: DesignSystem, outDir: string): Promise<string[]> {
  return writeArtifacts(outDir, contextArtifacts(ds));
}
