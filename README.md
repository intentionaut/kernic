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
- **Pipe-friendly exports** — `css` · `tailwind` · `json` · `fonts` · `dtcg` · `design-md` · stdout by default

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
kernic          # opens Studio, the visual editor, in your browser
kernic wizard   # the same thing in the terminal
```

Studio opens on a theme family, shows its looks, and one click applies a complete identity. The wizard walks through the same decisions as text prompts: naming, vibe, palette tuning with live previews, heading/body/mono fonts, radius and type scale. Systems are saved as plain JSON in `~/.config/kernic/systems/`.

### Skip both

```bash
kernic create launch-page --vibe corporate --yes
```

Vibes: `retro` (70s + 80s) · `tech` · `corporate` · `neon` · `minimal` · `soft-pastel` · `fun` · `earthy`

## Commands

| Command | What it does |
| --- | --- |
| `kernic` | **Visual editor** — opens Studio in your browser |
| `kernic wizard [name]` | The terminal flow, if you'd rather not leave the shell |
| `kernic create <name> [--vibe <id>]` | Create a new system |
| `kernic list` | List saved systems |
| `kernic show <name>` | Full spec + swatches |
| `kernic palette <name>` | Just the swatches |
| `kernic studio [name]` | Studio again, optionally opening an existing system |
| `kernic export <name> -f <format>` | Output to stdout |
| `kernic export <name> -f all -o ./design-system` | Write every token file |
| `kernic context <name> -o ./` | **Agent context** — writes `design.md` + W3C `tokens.json` for AI coding tools |
| `kernic apps` | **Your design across every project** — and which ones have fallen behind |
| `kernic mcp` | **MCP server** — let Claude Code / Cursor / Windsurf read and apply your systems |
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

# W3C DTCG tokens for Figma / Terrazzo / Style Dictionary
kernic export midnight-neon -f dtcg > design/tokens.dtcg.json

# Everything at once — the two stylesheets, both token files,
# the font links, and the agent brief
kernic export midnight-neon -f all -o ./design-system
```

Formats: `css` · `tailwind` · `json` · `fonts` · `dtcg` · `design-md` · `all`. Every format goes to stdout by default, or to files with `-o <dir>`. Nothing here is behind a paywall and nothing ever will be — the token format is only worth something if everyone can write it.

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

Or skip the copy-paste and let the agent do all of it over MCP:

```bash
claude mcp add kernic -- npx kernic mcp
```

Then, inside Claude Code / Cursor / Windsurf: *"set this project up with my kernic design system"*. The agent lists your systems, writes `design.md` and `tokens.json` into the project, and hands you the one line to paste into `CLAUDE.md`. If you have no system yet it can show you the 33 curated looks and build one from your pick, without you leaving the session.

| Tool | What the agent does with it |
| --- | --- |
| `list_systems` | See what you already have |
| `get_system` | Read one system's full spec |
| `get_tokens` | Pull tokens into the conversation (`design-md` / `css` / `tailwind` / `fonts` / `dtcg` / `json`) |
| `apply_to_project` | **Write the system into your project** — `design.md` + `tokens.json`, optionally `tokens.css` and `tailwind.css` |
| `create_system` | Make and save a new system from a look or a vibe |
| `list_looks` | The 33 curated looks — complete identities, one pick each |
| `list_vibes` | The 8 broader vibe presets |

`apply_to_project` is the one that writes to disk, so it is deliberately careful: it refuses `..` in a path, refuses your home directory and the filesystem root, only writes at the top level of the directory you name, and never replaces a file kernic did not write. If it finds one of yours it leaves it alone and tells you which.

## One design across every app

Applied a system to more than one project? `kernic apps` shows the whole picture:

```bash
kernic apps
```

It lists every project you've applied a system to, flags any whose tokens have fallen behind the system they came from, and prints the exact command to bring each one back — ready to paste. Entries live in `~/.config/kernic/projects.json`, and disappear on their own when a project folder is deleted.

Worth knowing: kernic only updates the project you run it in. Change a system and the other projects keep the tokens they already have until you re-apply there. `kernic apps` exists so that's visible rather than surprising. It mentions this once, the first time it's actually true for you; `kernic apps --mute` or `KERNIC_NO_UPSELL=1` turns that off for good.

## Development

```bash
git clone https://github.com/intentionaut/kernic.git
cd kernic && npm install
npm run dev      # CLI from source via tsx
npm run build    # tsc → dist/
```

Layout: `src/color.ts` (OKLCH engine) · `src/vibes.ts` (presets) · `src/studio/looks.ts` (curated looks) · `src/fonts.ts` (Google Fonts) · `src/wizard.ts` (interactive flow) · `src/context.ts` (agent brief + DTCG) · `src/export.ts` (exporters and the format registry) · `src/projects.ts` (which project uses which system) · `src/mcp.ts` (MCP server) · `src/storage.ts` (~/.config/kernic)

## Author

Built by [Saielle DaSilva](https://intentionaut.com/projects/) — more tools and experiments at [intentionaut.com/projects](https://intentionaut.com/projects/).

## Contributing

PRs welcome — especially new vibes, export targets (SCSS, Figma tokens), and W3C design-tokens output. The cloud Studio lives in a separate private repo; this codebase stays 100% MIT. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the testing expectations.

## License

[MIT](LICENSE)
