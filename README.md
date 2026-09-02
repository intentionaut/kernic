# kernic

**Kern your whole app.**

In typography, *kerning* is the adjustment of space between letters until text feels right — invisible when done well, amateurish when ignored. kernic does the same for your entire application: one design system, tuned once from the terminal, applied everywhere.

Pick a vibe, tune a palette in your terminal, choose Google Fonts, then export tokens as CSS custom properties, a Tailwind v4 `@theme`, W3C design tokens, a `DESIGN.md` for coding agents, or a shadcn theme.

## Free forever, by design

The CLI is and always will be free and open source (MIT). It generates complete design systems locally on your machine:

- **8 theme families, 33 curated looks** — Retro (70s & 80s), Tech, Corporate, Minimal, Neon (Stripe-style gradient fintech), Soft Pastel, Fun (loud solid color-blocks), Earthy/Organic. Pick a theme in Studio, click a look, done
- **Gradient tokens built in** — Neon looks ship with preconfigured `--gradient-*` tokens (mesh backdrops, gradient CTAs and headline text), exported to CSS vars and Tailwind v4 `bg-*` utilities
- **Terminal palette picker** — live ANSI swatches, hue shifting, harmony rules (analogous / complementary / triadic / monochrome), tinted neutrals
- **Real color science** — ramps generated in [OKLCH](https://oklch.com/) with automatic sRGB gamut fitting
- **The whole token set** — type scale with line heights, weights and tracking; a spacing scale; shadows tinted from your own neutrals, in a light and a dark set; motion durations and easing per vibe; breakpoints and containers. Every export carries all of it
- **All ~2k Google Fonts** — live search with bundled offline fallback
- **Pipe-friendly exports** — `css` · `tailwind` · `json` · `fonts` · `dtcg` · `design-md` · `shadcn` · stdout by default

Your local systems stay yours, in plain JSON, forever.

## Speaks the standards, by default

kernic generates the system. Everything else in your stack already has a format it reads, so kernic writes those formats without being asked:

| File | Standard | Who reads it |
| --- | --- | --- |
| `DESIGN.md` | [Google's DESIGN.md spec](https://github.com/google-labs-code/design.md) (`alpha`): tokens in YAML front matter, rules in prose | Claude Code, Cursor, Codex, Gemini CLI and any agent that reads a `DESIGN.md`. Every generated file is checked against Google's own linter in CI |
| `tokens.json` | [W3C Design Tokens, 2025.10](https://www.designtokens.org/): colors as OKLCH with a hex fallback, dimensions as value + unit | Terrazzo, Style Dictionary, Tokens Studio, Figma's variable importers |
| `shadcn.json` | [shadcn registry item](https://ui.shadcn.com/docs/registry) (`registry:style`) | `npx shadcn add ./shadcn.json`, and the shadcn MCP server |
| `tailwind.css` | Tailwind v4 `@theme`, with `:root` / `.dark` values wired through `@theme inline` the way shadcn does it | Tailwind, `dark:` variants included |

`kernic context <name>` writes the first three into a project in one go. `kernic export <name> -f all` adds the stylesheets and font links.

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

Studio opens on a theme family, shows its looks, and one click applies a complete identity. The wizard walks through the same decisions as text prompts: naming, vibe, palette tuning with live previews, heading/body/mono fonts, radius and type scale. Systems are saved as plain JSON in `~/.config/kernic/systems/`. Shadows, spacing, motion, line heights, breakpoints and containers are derived from those decisions and saved with them, so you can edit any value in the JSON by hand. A system saved by an earlier kernic is filled in the first time it loads.

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
| `kernic context <name> -o ./` | **Agent context** — writes `DESIGN.md`, W3C `tokens.json` and `shadcn.json` into a project (`--no-shadcn` to skip the last) |
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

Everything saves to the same local JSON store the CLI uses.

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

# A shadcn theme, applied with the shadcn CLI
kernic export midnight-neon -f shadcn > shadcn.json && npx shadcn add ./shadcn.json

# Everything at once — the two stylesheets, the token files,
# the font links, DESIGN.md and the shadcn item
kernic export midnight-neon -f all -o ./design-system
```

Formats: `css` · `tailwind` · `json` · `fonts` · `dtcg` · `design-md` · `shadcn` · `all`. Every format goes to stdout by default, or to files with `-o <dir>`. Nothing here is behind a paywall and nothing ever will be — the token format is only worth something if everyone can write it.

## Use with AI agents

Vibe-coded apps look generic because the agent invents colors as it goes. Give it your system instead:

```bash
kernic context midnight-neon -o .    # writes DESIGN.md, tokens.json and shadcn.json
```

Then point your agent at it — one line in `AGENTS.md`, `CLAUDE.md`, or `.cursorrules`:

```
Visual design: follow ./DESIGN.md exactly. Use only its tokens — never invent raw hex values.
```

`DESIGN.md` follows Google's spec: every token in the front matter (ramps, semantic roles, typography, radius, spacing) and the rules an agent must follow in the prose, ending with a Do and Don't list. Agents that already read a `DESIGN.md` need no introduction to it. `tokens.json` is W3C DTCG 2025.10, so Terrazzo, Style Dictionary and Figma pipelines read it too.

Or skip the copy-paste and let the agent do all of it over MCP:

```bash
claude mcp add kernic -- npx kernic mcp
```

Then, inside Claude Code / Cursor / Windsurf: *"set this project up with my kernic design system"*. The agent lists your systems, writes `DESIGN.md`, `tokens.json` and `shadcn.json` into the project, and hands you the one line to paste into `CLAUDE.md`. If you have no system yet it can show you the 33 curated looks and build one from your pick, without you leaving the session.

| Tool | What the agent does with it |
| --- | --- |
| `list_systems` | See what you already have |
| `get_system` | Read one system's full spec |
| `get_tokens` | Pull tokens into the conversation (`design-md` / `css` / `tailwind` / `fonts` / `dtcg` / `shadcn` / `json`) |
| `apply_to_project` | **Write the system into your project** — `DESIGN.md`, `tokens.json` and `shadcn.json`; `include` adds `tokens.css`, `tailwind.css` or `fonts.html`, `exclude` drops a standard file |
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

Layout: `src/color.ts` (OKLCH engine) · `src/vibes.ts` (presets) · `src/studio/looks.ts` (curated looks) · `src/fonts.ts` (Google Fonts) · `src/wizard.ts` (interactive flow) · `src/context.ts` (DESIGN.md + DTCG) · `src/shadcn.ts` (registry item) · `src/semantic.ts` (the roles every export shares) · `src/yaml.ts` (front matter) · `src/export.ts` (exporters and the format registry) · `src/projects.ts` (which project uses which system) · `src/mcp.ts` (MCP server) · `src/storage.ts` (~/.config/kernic)

## Author

Built in public; the build stories land first in [Intentionaut](https://intentionaut.com/subscribe/?utm_source=github-kernic). Built by [Saielle DaSilva](https://intentionaut.com/?utm_source=github.com&utm_medium=readme&utm_campaign=kernic). The story behind Kernic, how it works and what it refuses to do: [intentionaut.com/open-source/kernic](https://intentionaut.com/open-source/kernic/?utm_source=github.com&utm_medium=readme&utm_campaign=kernic). More open source at [intentionaut.com/open-source](https://intentionaut.com/open-source/?utm_source=github.com&utm_medium=readme&utm_campaign=kernic).

## Contributing

PRs welcome — especially new vibes and looks, and export targets (SCSS, Figma variables). This codebase is and stays 100% MIT. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the testing expectations.

## License

[MIT](LICENSE)
