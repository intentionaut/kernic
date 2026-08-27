import * as p from "@clack/prompts";
import {
  harmonize,
  oklchToHex,
  hexToOklch,
  randomSeed,
  type Harmony,
} from "./color.ts";
import { buildRamp, buildNeutral, type RampOptions } from "./color.ts";
import { getFontCatalog, searchFonts, type FontInfo } from "./fonts.ts";
import { renderPalette, renderRamp } from "./swatch.ts";
import { normalizeName, saveSystem } from "./storage.ts";
import type { DesignSystem } from "./types.ts";
import { RADIUS_PRESETS, VIBES, type Vibe } from "./vibes.ts";
import { buildDesignSystem } from "./build.ts";

function check<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Aborted.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

export interface PaletteState {
  primarySeed: string;
  accentSeed: string;
  neutralTintHue?: number;
}

export function shiftHue(hex: string, deg: number): string {
  const o = hexToOklch(hex);
  return oklchToHex({ ...o, h: o.h + deg });
}

export type NeutralTint = "match" | "warm" | "cool" | "pure";

/**
 * Pure seed derivation for the wizard's custom (non-vibe) palette flow.
 * `hue: undefined` means "surprise me" — a random hue is drawn from `rng`,
 * injectable so this is deterministic in tests.
 */
export function customSeedsFromInputs(
  hue: number | undefined,
  harmony: Harmony,
  tint: NeutralTint,
  rng: () => number = Math.random
): PaletteState {
  const resolvedHue = hue ?? Math.floor(rng() * 360);
  const primarySeed = oklchToHex({ l: 0.6, c: 0.17, h: resolvedHue });
  const accentSeed = harmonize(primarySeed, harmony);
  const neutralTintHue =
    tint === "match" ? hexToOklch(primarySeed).h : tint === "warm" ? 60 : tint === "cool" ? 230 : undefined;
  return { primarySeed, accentSeed, neutralTintHue };
}

export type PaletteAction = { type: "reset" } | { type: "randomize" } | { type: "shift"; degrees: number };

/**
 * Pure reducer for the wizard's preview loop (reset / randomize / shift).
 * "reset" and "randomize" are no-ops without a vibe (they're only offered
 * in the UI when one is set — this guard just makes that explicit here too).
 */
export function reducePaletteState(
  state: PaletteState,
  vibe: Vibe | undefined,
  action: PaletteAction,
  rng: () => number = Math.random
): PaletteState {
  if (action.type === "reset") {
    if (!vibe) return state;
    return { primarySeed: vibe.primarySeed, accentSeed: vibe.accentSeed, neutralTintHue: vibe.neutralTintHue };
  }
  if (action.type === "randomize") {
    if (!vibe) return state;
    const base = hexToOklch(vibe.primarySeed);
    const primarySeed = oklchToHex({
      ...base,
      h: base.h + (rng() * 60 - 30),
      c: Math.max(0.08, base.c + (rng() * 0.06 - 0.03)),
    });
    const acc = hexToOklch(vibe.accentSeed);
    const accentSeed = oklchToHex({ ...acc, h: acc.h + (rng() * 60 - 30) });
    return { ...state, primarySeed, accentSeed };
  }
  // shift
  return {
    ...state,
    primarySeed: shiftHue(state.primarySeed, action.degrees),
    accentSeed: shiftHue(state.accentSeed, action.degrees),
  };
}

function renderState(state: PaletteState, compress: RampOptions = {}): string {
  return [
    renderRamp("primary", buildRamp(state.primarySeed, compress)),
    renderRamp("accent", buildRamp(state.accentSeed, compress)),
    renderRamp("neutral", buildNeutral(state.neutralTintHue)),
  ].join("\n");
}

async function pickPalette(vibe?: Vibe): Promise<PaletteState> {
  const compress: RampOptions = vibe ? { chromaScale: vibe.chromaScale, lRange: vibe.lRange } : {};
  let state: PaletteState = vibe
    ? { primarySeed: vibe.primarySeed, accentSeed: vibe.accentSeed, neutralTintHue: vibe.neutralTintHue }
    : { primarySeed: randomSeed(), accentSeed: "", neutralTintHue: undefined };

  // Custom mode: choose seeds manually
  if (!vibe) {
    const hueInput = check(
      await p.text({
        message: "Primary hue (0–360, blank = surprise me)",
        placeholder: "e.g. 265 for violet",
        validate: (v) => {
          if (!v.trim()) return;
          const n = Number(v);
          if (Number.isNaN(n) || n < 0 || n > 360) return "Enter a number 0–360";
        },
      })
    );
    const harmony = check(
      await p.select({
        message: "Accent harmony",
        options: [
          { value: "analogous", label: "Analogous", hint: "+40° — safe & cohesive" },
          { value: "complementary", label: "Complementary", hint: "+180° — punchy contrast" },
          { value: "triadic", label: "Triadic", hint: "+120° — playful balance" },
          { value: "monochrome", label: "Monochrome", hint: "same hue, quiet luxury" },
        ],
      })
    ) as Harmony;

    const tint = check(
      await p.select({
        message: "Neutral tint",
        options: [
          { value: "match", label: "Match primary hue", hint: "cohesive, designer feel" },
          { value: "warm", label: "Warm", hint: "cream paper tones" },
          { value: "cool", label: "Cool", hint: "slate/blue-gray tones" },
          { value: "pure", label: "Pure gray", hint: "strictly neutral" },
        ],
      })
    ) as NeutralTint;

    state = customSeedsFromInputs(hueInput.trim() ? Number(hueInput) : undefined, harmony, tint);
  }

  // Preview loop
  for (;;) {
    p.note(renderState(state, compress), "Palette preview");
    const action = check(
      await p.select({
        message: "How does it look?",
        options: [
          { value: "keep", label: "Keep it", hint: "lock this palette" },
          { value: "shift", label: "Shift hue…", hint: "rotate primary/accent by N degrees" },
          ...(vibe ? [{ value: "randomize", label: "Surprise me", hint: "new random take on this vibe" }] : []),
          ...(vibe ? [{ value: "reset", label: "Back to preset" }] : []),
        ],
      })
    ) as string;

    if (action === "keep") return state;
    if (action === "reset") {
      state = reducePaletteState(state, vibe, { type: "reset" });
      continue;
    }
    if (action === "randomize") {
      state = reducePaletteState(state, vibe, { type: "randomize" });
      continue;
    }
    // shift
    const deg = check(
      await p.text({
        message: "Rotate hues by how many degrees? (+/-)",
        placeholder: "e.g. 20 or -15",
        validate: (v) => {
          const n = Number(v);
          if (!v.trim() || Number.isNaN(n)) return "Enter e.g. 20 or -15";
        },
      })
    );
    state = reducePaletteState(state, vibe, { type: "shift", degrees: Number(deg) });
  }
}

async function pickFont(
  catalog: FontInfo[],
  live: boolean,
  message: string,
  suggestions: string[]
): Promise<string> {
  const suggestedOptions = suggestions.map((f) => ({
    value: f,
    label: f,
    hint: catalog.find((c) => c.family === f)?.category,
  }));
  const choice = check(
    await p.select({
      message,
      options: [
        ...suggestedOptions,
        { value: "__search__", label: `Search all ${live ? "Google Fonts" : "(bundled)"} fonts…` },
      ],
    })
  ) as string;

  if (choice !== "__search__") return choice;

  for (;;) {
    const query = check(await p.text({ message: "Search fonts by name", placeholder: "e.g. grotesk, serif, mono…" }));
    const results = await searchFonts(catalog, query);
    if (results.length === 0) {
      p.log.warn("No matches — try another query.");
      continue;
    }
    return check(
      await p.select({
        message: `${results.length} match${results.length === 1 ? "" : "es"} — pick one`,
        options: [
          ...results.slice(0, 30).map((f) => ({ value: f.family, label: f.family, hint: f.category })),
          { value: "__again__", label: "Search again…" },
        ],
      })
    ) as string;
  }
}

export async function runWizard(nameArg?: string): Promise<DesignSystem> {
  p.intro("kernic — kern your whole app");

  // 1. Vibe
  const vibeId = check(
    await p.select({
      message: "Pick a vibe",
      options: [
        ...VIBES.map((v) => ({ value: v.id, label: v.label, hint: v.description })),
        { value: "__custom__", label: "Custom", hint: "roll your own from scratch" },
      ],
    })
  ) as string;
  const vibe = VIBES.find((v) => v.id === vibeId);

  // 2. Palette
  const palette = await pickPalette(vibe);

  // 3. Fonts
  const { fonts: catalog, live } = await getFontCatalog();
  if (!live) p.log.warn("Offline — using bundled font catalog.");
  const heading = await pickFont(catalog, live, "Heading font", vibe ? [vibe.fonts.heading] : []);
  const body = await pickFont(catalog, live, "Body font", vibe ? [vibe.fonts.body, heading] : [heading]);
  const mono = await pickFont(catalog, live, "Mono font", vibe ? [vibe.fonts.mono] : ["JetBrains Mono"]);

  // 4. Radius
  const radiusStyle = check(
    await p.select({
      message: "Corner radius style",
      initialValue: vibe?.radius ?? "soft",
      options: Object.keys(RADIUS_PRESETS).map((r) => ({
        value: r,
        label: r[0].toUpperCase() + r.slice(1),
        hint: `${RADIUS_PRESETS[r as keyof typeof RADIUS_PRESETS].md}`,
      })),
    })
  ) as keyof typeof RADIUS_PRESETS;

  // 5. Type scale
  const ratio = check(
    await p.select({
      message: "Type scale ratio",
      initialValue: String(vibe?.typeRatio ?? 1.25),
      options: [
        { value: "1.125", label: "1.125 major second", hint: "dense UIs" },
        { value: "1.2", label: "1.2 minor third", hint: "calm dashboards" },
        { value: "1.25", label: "1.25 major third", hint: "the all-rounder" },
        { value: "1.333", label: "1.333 perfect fourth", hint: "marketing sites" },
        { value: "1.414", label: "1.414 augmented fourth", hint: "editorial drama" },
        { value: "1.618", label: "1.618 golden ratio", hint: "maximalist serif energy" },
      ],
    })
  ) as string;

  const darkDefault = vibe?.darkModeDefault ?? false;
  const compress: RampOptions = vibe ? { chromaScale: vibe.chromaScale, lRange: vibe.lRange } : {};
  const colors = {
    primary: buildRamp(palette.primarySeed, compress),
    accent: buildRamp(palette.accentSeed, compress),
    neutral: buildNeutral(palette.neutralTintHue),
  };
  const radius = RADIUS_PRESETS[radiusStyle];

  // 6. Name
  let name = nameArg?.trim();
  while (!name) {
    name = check(
      await p.text({
        message: "What's this design system called?",
        placeholder: "e.g. midnight-neon, acme-brand",
        validate: (v) => (!normalizeName(v) ? "Letters, numbers and dashes please" : undefined),
      })
    );
  }
  const normalizedName = normalizeName(name)!;

  const ds: DesignSystem = buildDesignSystem({
    name: normalizedName,
    vibeId: vibe?.id ?? "custom",
    colors,
    darkDefault,
    fonts: { heading, body, mono },
    radiusStyle,
    radius,
    ratio: Number(ratio),
  });

  p.note(
    [
      renderPalette(ds.colors),
      "",
      `Fonts     ${ds.fonts.heading} · ${ds.fonts.body} · ${ds.fonts.mono}`,
      `Radius    ${ds.radius.style} (md: ${ds.radius.md})`,
      `Scale     ${ds.typeScale.ratio}x`,
    ].join("\n"),
    normalizedName
  );

  const confirmed = check(await p.confirm({ message: "Forge it?", initialValue: true }));
  if (!confirmed) {
    p.cancel("Discarded. Run kernic again anytime.");
    process.exit(0);
  }

  await saveSystem(ds);
  p.outro(`Saved "${normalizedName}". Try: kernic export ${normalizedName} --format tailwind`);
  return ds;
}
