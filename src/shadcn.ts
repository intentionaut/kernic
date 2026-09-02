import { contrastRatio, hexToOklch, oklchCss, oklchToHex } from "./color.ts";
import { easeCss, shadowCss } from "./tokens.ts";
import { SHADOW_LEVELS, type DesignSystem, type Ramp } from "./types.ts";

/**
 * A shadcn `registry:style` item. `npx shadcn add ./shadcn.json` applies the
 * system to a shadcn project, and the shadcn MCP server reads the same file,
 * so an agent working in that stack gets the tokens through the tool it
 * already has.
 *
 * shadcn's role names differ from kernic's: shadcn's `accent` is a subtle
 * hover surface, not a brand colour, so kernic's accent ramp is published as
 * `--color-accent-*` theme variables and the shadcn `accent` role is drawn
 * from the neutral ramp.
 */

export const SHADCN_FILE = "shadcn.json";
export const SHADCN_SCHEMA = "https://ui.shadcn.com/schema/registry-item.json";

/** Whichever of two candidates reads better on `bg`, by WCAG contrast ratio. */
export function onColor(bg: string, light: string, dark: string): string {
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}

/** A destructive red at the primary's lightness, so it belongs to the same palette. */
export function destructiveFor(primaryHex: string): string {
  const p = hexToOklch(primaryHex);
  return oklchToHex({ l: p.l, c: Math.max(0.16, p.c), h: 25 });
}

const sans = (family: string) => `"${family}", ui-sans-serif, system-ui, sans-serif`;
const serifish = (family: string) => `"${family}", ui-serif, Georgia, serif`;
const mono = (family: string) => `"${family}", ui-monospace, monospace`;

export interface ShadcnVars {
  theme: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** The three cssVars buckets, values as `oklch()` strings, names without `--`. */
export function shadcnVars(ds: DesignSystem): ShadcnVars {
  const p = ds.colors.primary;
  const a = ds.colors.accent;
  const n = ds.colors.neutral;
  const s = ds.semantic;
  const o = oklchCss;

  const theme: Record<string, string> = {
    "font-sans": sans(ds.fonts.body),
    "font-heading": serifish(ds.fonts.heading),
    "font-mono": mono(ds.fonts.mono),
  };
  for (const [ramp, stops] of Object.entries(ds.colors) as [string, Ramp][]) {
    for (const [stop, hex] of Object.entries(stops)) theme[`color-${ramp}-${stop}`] = o(hex);
  }
  for (const [k, v] of Object.entries(ds.motion.duration)) theme[`duration-${k}`] = v;
  theme["ease-out"] = easeCss(ds.motion.ease.out);
  theme["ease-in-out"] = easeCss(ds.motion.ease.inOut);
  theme["ease-emphasized"] = easeCss(ds.motion.ease.emphasized);
  for (const [k, v] of Object.entries(ds.typography.tracking)) theme[`tracking-${k}`] = v;

  const lightPrimary = p["600"];
  const darkPrimary = p["500"];
  const lightDestructive = destructiveFor(lightPrimary);
  const darkDestructive = destructiveFor(darkPrimary);

  // shadcn keeps --radius on :root and derives --radius-sm/md/lg from it.
  // Shadows sit beside it so light and dark each carry their own set.
  const light: Record<string, string> = {
    radius: ds.radius.md,
    ...Object.fromEntries(SHADOW_LEVELS.map((l) => [`shadow-${l}`, shadowCss(ds.shadows[l].light)])),
    background: o(s.background.light),
    foreground: o(s.text.light),
    card: o(s.surface.light),
    "card-foreground": o(s.text.light),
    popover: o(s.surface.light),
    "popover-foreground": o(s.text.light),
    primary: o(lightPrimary),
    "primary-foreground": o(onColor(lightPrimary, n["50"], n["950"])),
    secondary: o(n["100"]),
    "secondary-foreground": o(n["900"]),
    muted: o(n["100"]),
    "muted-foreground": o(s.mutedText.light),
    accent: o(n["200"]),
    "accent-foreground": o(n["900"]),
    destructive: o(lightDestructive),
    "destructive-foreground": o(onColor(lightDestructive, n["50"], n["950"])),
    border: o(s.border.light),
    input: o(s.border.light),
    ring: o(s.ring),
    "chart-1": o(p["500"]),
    "chart-2": o(a["500"]),
    "chart-3": o(p["300"]),
    "chart-4": o(a["300"]),
    "chart-5": o(n["500"]),
    sidebar: o(s.background.light),
    "sidebar-foreground": o(s.text.light),
    "sidebar-primary": o(lightPrimary),
    "sidebar-primary-foreground": o(onColor(lightPrimary, n["50"], n["950"])),
    "sidebar-accent": o(n["200"]),
    "sidebar-accent-foreground": o(n["900"]),
    "sidebar-border": o(s.border.light),
    "sidebar-ring": o(s.ring),
  };

  const dark: Record<string, string> = {
    radius: ds.radius.md,
    ...Object.fromEntries(SHADOW_LEVELS.map((l) => [`shadow-${l}`, shadowCss(ds.shadows[l].dark)])),
    background: o(s.background.dark),
    foreground: o(s.text.dark),
    card: o(s.surface.dark),
    "card-foreground": o(s.text.dark),
    popover: o(s.surface.dark),
    "popover-foreground": o(s.text.dark),
    primary: o(darkPrimary),
    "primary-foreground": o(onColor(darkPrimary, n["50"], n["950"])),
    secondary: o(n["800"]),
    "secondary-foreground": o(n["100"]),
    muted: o(n["800"]),
    "muted-foreground": o(s.mutedText.dark),
    accent: o(n["800"]),
    "accent-foreground": o(n["100"]),
    destructive: o(darkDestructive),
    "destructive-foreground": o(onColor(darkDestructive, n["50"], n["950"])),
    border: o(s.border.dark),
    input: o(s.border.dark),
    ring: o(s.ring),
    "chart-1": o(p["400"]),
    "chart-2": o(a["400"]),
    "chart-3": o(p["200"]),
    "chart-4": o(a["200"]),
    "chart-5": o(n["400"]),
    sidebar: o(s.surface.dark),
    "sidebar-foreground": o(s.text.dark),
    "sidebar-primary": o(darkPrimary),
    "sidebar-primary-foreground": o(onColor(darkPrimary, n["50"], n["950"])),
    "sidebar-accent": o(n["800"]),
    "sidebar-accent-foreground": o(n["100"]),
    "sidebar-border": o(s.border.dark),
    "sidebar-ring": o(s.ring),
  };

  return { theme, light, dark };
}

/** The registry item as JSON text, ready for `npx shadcn add`. */
export function shadcnRegistryItem(ds: DesignSystem): string {
  const fonts = [ds.fonts.heading, ds.fonts.body, ds.fonts.mono].filter((f, i, arr) => arr.indexOf(f) === i);
  const item = {
    $schema: SHADCN_SCHEMA,
    name: ds.name,
    type: "registry:style",
    title: ds.name,
    description: `kernic design system, vibe: ${ds.vibe}.`,
    meta: { generator: "kernic", vibe: ds.vibe, schemaVersion: ds.schemaVersion, createdAt: ds.createdAt },
    cssVars: shadcnVars(ds),
    docs: `Fonts come from Google Fonts: ${fonts.join(", ")}. Load them in your layout (\`kernic export ${ds.name} -f fonts\` prints the <link> tags). Brand accent ramp: bg-accent-500 and friends; shadcn's own accent role stays neutral.`,
  };
  return JSON.stringify(item, null, 2) + "\n";
}

/** True for a shadcn.json kernic wrote, by the generator stamp in `meta`. */
export function isKernicShadcn(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { meta?: { generator?: unknown } } | null;
    return !!parsed && typeof parsed === "object" && parsed.meta?.generator === "kernic";
  } catch {
    return false;
  }
}
