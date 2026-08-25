import * as p from "@clack/prompts";
import {
  harmonize,
  oklchToHex,
  hexToOklch,
  randomSeed,
  type Harmony,
} from "./color.ts";
import { buildRamp, buildNeutral } from "./color.ts";
import { getFontCatalog, searchFonts, type FontInfo } from "./fonts.ts";
import { renderPalette, renderRamp } from "./swatch.ts";
import { normalizeName, saveSystem } from "./storage.ts";
import type { DesignSystem } from "./types.ts";
import { RADIUS_PRESETS, VIBES, type Vibe } from "./vibes.ts";
import { semanticFromRamps } from "./build.ts";

function check<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Aborted.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

interface PaletteState {
  primarySeed: string;
  accentSeed: string;
  neutralTintHue?: number;
}

function shiftHue(hex: string, deg: number): string {
  const o = hexToOklch(hex);
  return oklchToHex({ ...o, h: o.h + deg });
}

function renderState(state: PaletteState): string {
  return [
    renderRamp("primary", buildRamp(state.primarySeed)),
    renderRamp("accent", buildRamp(state.accentSeed)),
    renderRamp("neutral", buildNeutral(state.neutralTintHue)),
  ].join("\n");
}

async function pickPalette(vibe?: Vibe): Promise<PaletteState> {
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
    const hue = hueInput.trim() ? Number(hueInput) : Math.floor(Math.random() * 360);
    state.primarySeed = oklchToHex({ l: 0.6, c: 0.17, h: hue });

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
    state.accentSeed = harmonize(state.primarySeed, harmony);

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
    ) as string;
    state.neutralTintHue =
      tint === "match" ? hexToOklch(state.primarySeed).h : tint === "warm" ? 60 : tint === "cool" ? 230 : undefined;
  }

  // Preview loop
  for (;;) {
    p.note(renderState(state), "Palette preview");
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
      state = { primarySeed: vibe!.primarySeed, accentSeed: vibe!.accentSeed, neutralTintHue: vibe!.neutralTintHue };
      continue;
    }
    if (action === "randomize") {
      const base = hexToOklch(vibe!.primarySeed);
      state.primarySeed = oklchToHex({ ...base, h: base.h + (Math.random() * 60 - 30), c: Math.max(0.08, base.c + (Math.random() * 0.06 - 0.03)) });
      const acc = hexToOklch(vibe!.accentSeed);
      state.accentSeed = oklchToHex({ ...acc, h: acc.h + (Math.random() * 60 - 30) });
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
    state.primarySeed = shiftHue(state.primarySeed, Number(deg));
    state.accentSeed = shiftHue(state.accentSeed, Number(deg));
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

  // 1. Name
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

  // 2. Vibe
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

  // 3. Palette
  const palette = await pickPalette(vibe);

  // 4. Fonts
  const { fonts: catalog, live } = await getFontCatalog();
  if (!live) p.log.warn("Offline — using bundled font catalog.");
  const heading = await pickFont(catalog, live, "Heading font", vibe ? [vibe.fonts.heading] : []);
  const body = await pickFont(catalog, live, "Body font", vibe ? [vibe.fonts.body, heading] : [heading]);
  const mono = await pickFont(catalog, live, "Mono font", vibe ? [vibe.fonts.mono] : ["JetBrains Mono"]);

  // 5. Radius
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

  // 6. Type scale
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
  const colors = {
    primary: buildRamp(palette.primarySeed),
    accent: buildRamp(palette.accentSeed),
    neutral: buildNeutral(palette.neutralTintHue),
  };
  const radius = RADIUS_PRESETS[radiusStyle];

  const ds: DesignSystem = {
    schemaVersion: 1,
    name: normalizedName,
    vibe: vibe?.id ?? "custom",
    createdAt: new Date().toISOString(),
    colors,
    semantic: semanticFromRamps(colors, darkDefault),
    fonts: { heading, body, mono },
    radius: { style: radiusStyle, ...radius },
    typeScale: { ratio: Number(ratio), baseRem: 1 },
  };

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
