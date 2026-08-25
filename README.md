# kernic

**Kern your whole app.**

In typography, *kerning* is the adjustment of space between letters until text feels right — invisible when done well, amateurish when ignored. kernic does the same for your entire application: one design system, tuned once from the terminal, applied everywhere.

Pick a vibe, tune a palette in your terminal, choose Google Fonts, then export tokens as CSS custom properties, a Tailwind v4 `@theme`, JSON, or font imports.

## Free forever, by design

The CLI is and always will be free and open source (MIT). It generates complete design systems locally on your machine:

- **7 theme families, 24 curated looks** — Retro (70s & 80s), Tech, Corporate, Minimal, Soft Pastel, Luxury, Earthy/Organic. Pick a theme in Studio, click a look, done
- **Terminal palette picker** — live ANSI swatches, hue shifting, harmony rules (analogous / complementary / triadic / monochrome), tinted neutrals
- **Real color science** — ramps generated in [OKLCH](https://oklch.com/) with automatic sRGB gamut fitting
- **All ~2k Google Fonts** — live search with bundled offline fallback
- **Pipe-friendly exports** — `css` · `tailwind` · `json` · `fonts` · stdout by default

### Roadmap: what's free vs. paid

| | CLI (free, MIT) | Cloud Studio (paid) |
| --- | --- | --- |
| Palette + font generation | ✅ | ✅ |
| CSS / Tailwind / JSON exports | ✅ | ✅ |
| Local token storage | ✅ | ✅ |
| Local visual editor (`kernic studio`) | ✅ | ✅ |
| Motion & animation tokens | — | ✅ |
| Shadows, depth & rhythm scales | — | ✅ |
| Multi-brand management | — | ✅ |
| Sync across projects & repos | — | ✅ |
| Version history & rollbacks | — | ✅ |

The token format (`schemaVersion` + extensible `extensions`) is designed so premium layers never break free-tier files. Your local systems stay yours, in plain JSON, forever.

## Install

```bash
npm install -g kernic
# or run instantly:
npx kernic
```

Requires Node 20+.

## Quick start

```bash
kernic          # interactive wizard
kn              # same, shorter
```

The wizard walks through naming, vibe, palette tuning with live previews, heading/body/mono fonts, radius and type scale. Systems are saved as plain JSON in `~/.config/kernic/systems/`.

### Skip the wizard

```bash
kernic create launch-page --vibe corporate-clean --yes
```

Vibes: `retro` (70s + 80s) · `tech` · `corporate` · `minimal` · `soft-pastel` · `luxury` · `earthy`

## Commands

| Command | What it does |
| --- | --- |
| `kernic` | Interactive wizard |
| `kernic create <name> [--vibe <id>]` | Create a new system |
| `kernic list` | List saved systems |
| `kernic show <name>` | Full spec + swatches |
| `kernic palette <name>` | Just the swatches |
| `kernic studio [name]` | **Visual editor** — opens in your browser, live preview, saves locally |
| `kernic export <name> -f <format>` | Output to stdout |
| `kernic export <name> -f all -o ./design-system` | Write all token files |
| `kernic delete <name>` | Remove a system |

## Studio

`kernic studio` launches a local web app (127.0.0.1 only) where you design visually instead of in the terminal:

- Live-rendered preview — nav, hero, cards, form, type specimen — restyled as you tweak
- Hue slider + harmony controls with instant OKLCH ramp regeneration
- Searchable Google Fonts loaded into the preview
- Light/dark mode toggle, corner-radius and type-scale controls
- Click any swatch to copy its hex

Everything saves to the same local JSON store the CLI uses. The cloud Studio adds multi-brand management, sync, and version history on top of this foundation.

## Using it in a project

```bash
# Tailwind v4 app.css
kernic export midnight-neon -f tailwind > src/app.css

# Plain CSS vars anywhere
kernic export midnight-neon -f css >> styles/global.css

# Machine-readable tokens for tools and AI agents
kernic export midnight-neon -f json > design/tokens.json
```

## Development

```bash
git clone https://github.com/intentionaut/kernic.git
cd kernic && npm install
npm run dev      # CLI from source via tsx
npm run build    # tsc → dist/
```

Layout: `src/color.ts` (OKLCH engine) · `src/vibes.ts` (presets) · `src/fonts.ts` (Google Fonts) · `src/wizard.ts` (interactive flow) · `src/export.ts` (exporters) · `src/storage.ts` (~/.config/kernic)

## Contributing

PRs welcome — especially new vibes, export targets (SCSS, Figma tokens), and W3C design-tokens output. The cloud Studio lives in a separate private repo; this codebase stays 100% MIT.

## License

[MIT](LICENSE)
