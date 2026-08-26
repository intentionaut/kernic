# kernic

**Kern your whole app.**

In typography, *kerning* is the adjustment of space between letters until text feels right — invisible when done well, amateurish when ignored. kernic does the same for your entire application: one design system, tuned once from the terminal, applied everywhere.

Pick a vibe, tune a palette in your terminal, choose Google Fonts, then export tokens as CSS custom properties, a Tailwind v4 `@theme`, JSON, or font imports.

## Free forever, by design

The CLI is and always will be free and open source (MIT). It generates complete design systems locally on your machine:

- **8 theme families, 33 curated looks** — Retro (70s & 80s), Tech, Corporate, Minimal, Neon (Stripe-style gradient fintech), Soft Pastel, Fun (loud solid color-blocks), Earthy/Organic. Pick a theme in Studio, click a look, done
- **Gradient tokens built in** — Neon looks ship with preconfigured `--gradient-*` tokens (mesh backdrops, gradient CTAs and headline text), exported to CSS vars and Tailwind v4 `bg-*` utilities
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

Vibes: `retro` (70s + 80s) · `tech` · `corporate` · `neon` · `minimal` · `soft-pastel` · `fun` · `earthy`

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
| `kernic context <name> -o ./` | **Agent context** — writes `design.md` + W3C `tokens.json` for AI coding tools |
| `kernic mcp` | **MCP server** — let Claude Code / Cursor / Windsurf read your systems |
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

## Use with AI agents

Vibe-coded apps look generic because the agent invents colors as it goes. Give it your system instead:

```bash
kernic context midnight-neon -o .    # writes design.md + tokens.json
```

Then point your agent at it — one line in `AGENTS.md`, `CLAUDE.md`, or `.cursorrules`:

```
Visual design: follow ./design.md exactly. Use only its tokens — never invent raw hex values.
```

`design.md` carries explicit adherence rules plus every token (colors, semantics, type scale, radius, fonts); `tokens.json` is W3C DTCG-style, so Figma/Terrazzo/Style Dictionary pipelines read it too.

Or let agents query kernic live over MCP:

```bash
claude mcp add kernic -- npx kernic mcp
```

Tools: `list_systems` · `get_system` · `get_tokens` (design-md / css / tailwind / fonts / dtcg / json) · `list_vibes`.

## Development

```bash
git clone https://github.com/intentionaut/kernic.git
cd kernic && npm install
npm run dev      # CLI from source via tsx
npm run build    # tsc → dist/
```

Layout: `src/color.ts` (OKLCH engine) · `src/vibes.ts` (presets) · `src/fonts.ts` (Google Fonts) · `src/wizard.ts` (interactive flow) · `src/export.ts` (exporters) · `src/storage.ts` (~/.config/kernic)

## Author

Built by [Saielle DaSilva](https://intentionaut.com/projects/) — more tools and experiments at [intentionaut.com/projects](https://intentionaut.com/projects/).

## Contributing

PRs welcome — especially new vibes, export targets (SCSS, Figma tokens), and W3C design-tokens output. The cloud Studio lives in a separate private repo; this codebase stays 100% MIT.

## License

[MIT](LICENSE)
