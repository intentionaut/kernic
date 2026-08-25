# umbrik

**Wrap any project in a polished design system — from the terminal.**

*ümbrik* is Estonian for *envelope*. Your app is the letter; umbrik makes the envelope worth opening.

Pick a vibe, tune a palette, choose Google Fonts, then export your tokens as CSS custom properties, a Tailwind v4 `@theme`, JSON, or font imports. Forge once, reuse everywhere.

## Why

Vibe coders ship fast — and it shows in the default-blue buttons and system fonts. umbrik gives every project an intentional identity in under two minutes, without opening a design tool:

- **10 curated vibes** — Cyberpunk, Brutalist, Soft Pastel, Corporate Clean, Earthy, Luxury, Playful, Retro 70s, Mono Minimal, Ocean Calm
- **Palette picker in your terminal** — live ANSI swatches, hue shifting, harmony rules (analogous / complementary / triadic / monochrome), tinted neutrals
- **Real color science** — ramps are generated in [OKLCH](https://oklch.com/) with automatic sRGB gamut fitting, so every step from 50 to 950 stays perceptually even
- **All ~2k Google Fonts** — searchable live (bundled catalog fallback when offline)
- **Pipe-friendly exports** — stdout by default, files with `-o`

## Install

```bash
npm install -g umbrik
```

or run it straight away:

```bash
npx umbrik
```

Requires Node 20+.

## Quick start

```bash
umbrik            # opens the interactive wizard
um                # same thing, lazier
```

The wizard walks you through naming your system, picking a vibe, tuning the palette with live previews, choosing heading/body/mono fonts, and setting radius + type scale. Everything is saved as plain JSON in `~/.config/umbrik/systems/` — easy to back up, version, or share.

### Skip the wizard

```bash
umbrik create launch-page --vibe corporate-clean --yes
```

Available vibes: `cyberpunk` · `brutalist` · `soft-pastel` · `corporate-clean` · `earthy` · `luxury` · `playful` · `retro` · `mono-minimal` · `ocean-calm`

## Commands

| Command | What it does |
| --- | --- |
| `umbrik` | Interactive wizard |
| `umbrik create <name> [--vibe <id>]` | Seal a new design system |
| `umbrik list` | List saved systems |
| `umbrik show <name>` | Full spec + swatches |
| `umbrik palette <name>` | Just the swatches |
| `umbrik export <name> -f <format>` | Output to stdout |
| `umbrik export <name> -f all -o ./design-system` | Write all token files |
| `umbrik delete <name>` | Remove a system |

Formats: `css` · `tailwind` · `json` · `fonts` · `all`

## Using it in a project

```bash
# Tailwind v4 app.css
umbrik export midnight-neon -f tailwind > src/app.css

# Plain CSS vars anywhere
umbrik export midnight-neon -f css >> styles/global.css

# Machine-readable tokens for tools and AI agents
umbrik export midnight-neon -f json > design/tokens.json

# Everything at once
umbrik export midnight-neon -f all -o ./design-system
```

## Example

```bash
$ um create launch --vibe ocean-calm --yes
Sealed "launch" (Ocean Calm). Try: umbrik show launch

$ um palette launch
primary  ▓▓▓▓▓▓▓▓▓▓▓   #ecfdfc → #042f2e
accent   ▓▓▓▓▓▓▓▓▓▓▓   ...
neutral  ▓▓▓▓▓▓▓▓▓▓▓   ...
```

## Development

```bash
git clone https://github.com/intentionaut/umbrik.git
cd umbrik
npm install
npm run dev      # CLI from source via tsx
npm run build    # tsc → dist/
```

Project layout:

- `src/color.ts` — sRGB/Hex/OKLCH conversions, ramp + harmony generation
- `src/vibes.ts` — curated presets (seeds, fonts, radius, type ratio)
- `src/fonts.ts` — Google Fonts catalog fetcher (24h cache) + bundled fallback
- `src/wizard.ts` — interactive flow (@clack/prompts)
- `src/export.ts` — CSS / Tailwind v4 / fonts exporters
- `src/storage.ts` — save/load/list/delete in `~/.config/umbrik`

## Contributing

PRs welcome! Good first issues: more vibe presets, additional export targets (Figma tokens, SCSS), and a browser-based visual editor launched from the CLI.

## License

[MIT](LICENSE)
