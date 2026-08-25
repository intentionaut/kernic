import { fontImportUrl } from "./fonts.ts";
import type { DesignSystem } from "./types.ts";

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

function spaceVars(): string[] {
  const steps = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
  return steps.map((n) => `  --space-${String(n).replace(".", "-")}: ${n}rem;`);
}

function scaleVars(ds: DesignSystem): string[] {
  const names = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];
  const exps = [-1, -0.5, 0, 1, 2, 3, 5, 7, 9];
  return names.map((n, i) => `  --text-${n}: ${(ds.typeScale.baseRem * Math.pow(ds.typeScale.ratio, exps[i])).toFixed(3)}rem;`);
}

/** Plain CSS custom properties, ready to paste into a global stylesheet. */
export function exportCss(ds: DesignSystem): string {
  return [
    `/* umbrik — "${ds.name}" (vibe: ${ds.vibe}) */`,
    `@import url("${fontImportUrl(ds.fonts.heading)}");`,
    `@import url("${fontImportUrl(ds.fonts.body)}");`,
    `@import url("${fontImportUrl(ds.fonts.mono)}");`,
    "",
    ":root {",
    ...colorVars(ds),
    "",
    "  /* Typography */",
    ...scaleVars(ds),
    ...fontVars(ds),
    "",
    "  /* Radius & spacing */",
    ...radiusVars(ds),
    ...spaceVars(),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root:not(.light) {",
    "    --background: var(--dark-background);",
    "    --surface: var(--dark-surface);",
    "    --text: var(--dark-text);",
    "    --muted-text: var(--dark-muted-text);",
    "    --border: var(--dark-border);",
    "  }",
    "}",
    "",
  ].join("\n");
}

/** Tailwind v4 @theme block. */
export function exportTailwind(ds: DesignSystem): string {
  const twColors: string[] = [];
  for (const [rampName, ramp] of Object.entries(ds.colors)) {
    for (const [stop, hex] of Object.entries(ramp)) {
      twColors.push(`  --color-${rampName}-${stop}: ${hex};`);
    }
  }
  // Tailwind v4 semantic aliases
  twColors.push(
    `  --color-background: ${ds.semantic.background.light};`,
    `  --color-surface: ${ds.semantic.surface.light};`,
    `  --color-foreground: ${ds.semantic.text.light};`,
    `  --color-muted: ${ds.semantic.mutedText.light};`,
    `  --color-border-default: ${ds.semantic.border.light};`
  );
  return [
    `/* umbrik — "${ds.name}" Tailwind v4 theme (vibe: ${ds.vibe}) */`,
    `@import "tailwindcss";`,
    `@import url("${fontImportUrl(ds.fonts.heading)}");`,
    `@import url("${fontImportUrl(ds.fonts.body)}");`,
    `@import url("${fontImportUrl(ds.fonts.mono)}");`,
    "",
    "@theme {",
    ...twColors,
    "",
    `  --font-heading: "${ds.fonts.heading}", ui-serif, serif;`,
    `  --font-body: "${ds.fonts.body}", ui-sans-serif, system-ui, sans-serif;`,
    `  --font-mono: "${ds.fonts.mono}", ui-monospace, monospace;`,
    "",
    `  --radius-sm: ${ds.radius.sm};`,
    `  --radius-md: ${ds.radius.md};`,
    `  --radius-lg: ${ds.radius.lg};`,
    `  --radius-xl: ${ds.radius.xl};`,
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
    `<!-- umbrik — "${ds.name}" Google Fonts -->`,
    ...preconnect,
    ...stylesheets,
    "",
    "/* or in CSS: */",
    ...imports,
    "",
  ].join("\n");
}
