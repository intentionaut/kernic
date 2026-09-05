# Changelog

New changes to Kernic.

Kernic is free and open source software we pride ourselves on shipping to help
improve the vibe-coded web.

## How these are written

Written for the person using kernic, not for the person who wrote the commit.
Hard rules. An entry that breaks one of them does not ship.

1. **Benefit first, mechanism second.** The reader is deciding whether to
   upgrade, not reviewing the diff. The headline is what they can now do, in
   their words. No internal names, no function names, no file paths in a
   headline.
2. **Five bullets, and they say what the reader gets.** Five on average. A
   release that seems to need more is usually two releases, or one bullet
   repeated. Each bullet opens with a bolded plain outcome, then one or two
   sentences explaining it.
3. **Plain words, measured against this reader.** kernic's reader writes code
   and lives in a terminal, so CSS variables, Tailwind, fonts, tokens, exports
   and the shell are their language and stay. What does not: our internal names
   for things, the names of modules and functions, anything about how the code
   is organized, and design-system vocabulary a person could use kernic without
   ever meeting. If a term would send them to a search engine, explain it in the
   clause or cut it.
4. **Write the capability, not the correction.** When a change exists because
   something was broken, that is the one thing this file must not dwell on. Name
   what the reader now has. A bullet that only removes something is half written
   until it says what fills the space.
5. **No relief from a burden they never carried.** A bullet naming what a change
   spares the reader ("no config file", "no extra step", "nothing to install")
   only works if they lived through the thing being spared. Where they never had
   it, the sentence describes a design conversation they were not in, and it
   leaves them wondering what they missed. The test is whether the absence was
   ever present in a version they used. If it was not, say where the work
   happens rather than where it does not. Same for contrasts against tools that
   were never part of kernic.
6. **Never talk kernic down, past or present.** Describe what it does now. A
   change that corrects earlier behavior says what is better in one clause and
   moves on. No adjectives about how bad the old way was, and no jokes at
   kernic's expense: this file is public and permanent.
7. **Nothing from a conversation, and nothing about a person.** What was said
   while building this is private, including when it was the reason for the
   change. No detail traceable to one person's setup. Credit a reporter by name
   only when they reported it in public and would want it.
8. **Write it in kernic's voice**, which is not the voice of anything else we
   publish. `docs/voice.md` has the specifics: American spelling, lowercase
   `kernic`, second person for the reader and "we" for the maintainers.

---

## 0.3.2 (2026-09-05)

`DESIGN.md` has always told you to build with `--primary`, `--primary-hover`
and `--accent`. Now every CSS export actually defines them.

**What this gives you:**

- **`--primary`, `--primary-hover` and `--accent` as real variables.**
  `tokens.css`, `tailwind.css` and the Tailwind `@theme` block all publish
  them, aliased onto the same ramp stops `DESIGN.md` already names. Write
  `background: var(--primary)` and it paints, in a Tailwind class or in plain
  CSS.

Re-run `kernic export` or `kernic context` on a project to pick these up; a
`tokens.css` written by an earlier kernic keeps working but won't have them
until you regenerate it.

---

## 0.3.1 (2026-09-02)

Studio is where you decide what a system looks like. It now shows that system
under the kind of site it is actually for, lets you bring one in and take one
out, and keeps a check on it while you work.

**What this gives you:**

- **A preview that fits the system you are building.** Each vibe previews a
  different kind of product, with its own brand, copy and section order. Retro
  is a radio station, corporate is an advisory firm, neon is a payments API.
  A palette that works on a pricing table and falls apart on an editorial page
  now shows you both.

- **Tokens out of Studio, in the format you need.** Export copies your system
  to the clipboard as CSS variables, a Tailwind config or JSON, so you can put
  it straight into a project without saving it first.

- **Start from a system you already have.** Import takes CSS variables, a
  `DESIGN.md` table or a saved kernic system, pasted in, and seeds Studio with
  its colors, fonts and radius. Ramps and swatches redraw around what you
  brought in.

- **Undo and redo while you fine-tune.** Cmd+Z steps back through the hue
  slider, harmony, tint, radius, type scale and font pickers, and Cmd+Shift+Z
  returns. A drag of the hue slider is one step, not fifty.

- **Contrast and phone width, checked as you go.** The preview bar shows the
  WCAG ratio of your text on your background, green on a pass and red on a
  fail, updated as you edit and as you switch between light and dark. Beside it,
  a phone toggle renders the preview at 390px with a real mobile nav.

---

## 0.3.0 (2026-09-02)

A design system is more than colors and fonts. kernic now decides the rest as
well: spacing, shadows, motion, line heights and weights, breakpoints and
containers, all derived from the choices you already made, and all written
into every export.

**What this gives you:**

- **Shadows that belong to your palette.** Five levels, tinted from your own
  darkest neutral rather than plain black, so a warm system throws a warm
  shadow. Each level has a light and a dark value, and the dark set is denser
  so it still reads on a dark surface. `--shadow-xs` to `--shadow-xl` in CSS
  and Tailwind, `shadow.light` and `shadow.dark` in the W3C tokens, and beside
  `radius` in the shadcn theme.

- **Motion with a temperament.** Each vibe sets one of three presets: calm,
  brisk or lively. That gives you `--duration-fast`, `--duration-base` and
  `--duration-slow`, and three easing curves, none of which overshoot. The
  CSS export turns durations to zero under `prefers-reduced-motion`.

- **Type that comes with its line height.** Every step of the scale carries a
  leading value (`--text-xl--line-height` in Tailwind, `--leading-xl` in CSS),
  and the system names its weights and tracking. `DESIGN.md` roles now cite
  weight, line height and letter spacing from those tokens.

- **Spacing, breakpoints and containers as tokens.** `--spacing` sets the
  Tailwind unit, `--space-*` and `--spacing-*` carry the named steps, and
  `--breakpoint-*` and `--container-*` match Tailwind's defaults. `DESIGN.md`
  gains a Layout section with all of them and a prose measure.

- **Dark mode in the Tailwind export.** Semantic colors and shadows sit on
  `:root` and `.dark` and reach the theme through `@theme inline`, the way
  shadcn wires its variables, so `dark:` works without a second file.

A system saved by an earlier kernic is filled in with all of this the first
time it loads, from its own ramps and vibe. Projects you applied before will
show as behind in `kernic apps`, with the command to bring them up to date.

---

## 0.2.0 (2026-09-02)

kernic now writes the files the rest of your stack already reads. One command
puts a `DESIGN.md` for coding agents, W3C design tokens and a shadcn theme into
your project, each in the format its reader expects.

**What this gives you:**

- **`DESIGN.md`, in the format coding agents already know.** kernic writes
  Google's DESIGN.md spec: every token in the front matter, and the rules to
  follow in the prose, ending with a Do and Don't list. Claude Code, Cursor,
  Codex and Gemini CLI read it as is. Every generated file is checked against
  Google's own linter before a release ships.

- **A shadcn theme, ready for `npx shadcn add`.** `kernic export <name> -f shadcn`
  writes a registry item with your colors as `oklch()` values for light and
  dark, your fonts and your radius, mapped onto shadcn's role names. The shadcn
  MCP server reads the same file, so an agent in a shadcn project gets your
  tokens through the tool it already has.

- **W3C design tokens in the 2025.10 stable format.** Colors carry OKLCH
  components plus a hex fallback, dimensions carry a value and a unit, and each
  semantic role points at the ramp stop it came from. Terrazzo, Style
  Dictionary, Tokens Studio and Figma's importers all read it.

- **`kernic context` writes all three at once.** `DESIGN.md`, `tokens.json` and
  `shadcn.json` land together; add `--no-shadcn` for a project that does not
  use shadcn. Your assistant's `apply_to_project` writes the same set, and takes
  `include` for stylesheets and `exclude` to leave a standard file out.

- **The brief is called `DESIGN.md` now.** It takes the name the spec uses. A
  `design.md` from an earlier kernic is still recognized as kernic's own, still
  regenerated by `kernic apps`, and still replaced rather than blocked when you
  re-apply.

---

## 0.1.7 (2026-08-30)

Your AI coding assistant can now set up a design system for you, without you
leaving the conversation. Exports include the file that makes that work. And
kernic will never overwrite a file it did not write.

**What this gives you:**

- **Ask your coding assistant to style your app, and it can.** kernic could
  already show an assistant your colors and fonts. It could not put them into
  your project. Now it can. Ask Claude Code or Cursor to apply your design
  system and it writes the files, then tells you the one line to add so every
  future session picks it up. It can also create a system from scratch if you
  do not have one yet, so you are never stuck at an empty list.

- **Your assistant can see all 33 looks.** A look is a finished decision:
  colors, fonts, corners and text sizes, all chosen to go together. Your
  assistant could see the eight broad styles before; now it can offer you the
  finished ones.

- **Exporting everything includes `design.md`.** This is the file that tells
  an AI assistant which colors and fonts to use, and to stop inventing its own.
  `kernic export -f all` now carries it. You can also export it on its own with
  `-f design-md`, and export standard W3C design tokens with `-f dtcg`.

- **`kernic apps` shows your design across every project you have used it in.**
  One command, one list. If a project has fallen behind because you changed the
  system since, it says so, and prints the exact command to bring it back.

- **kernic will not overwrite a file it did not write.** `tokens.json` is also
  the filename Style Dictionary, Tokens Studio and Figma Tokens use. If you had
  one, `kernic context` and `kernic export -o` used to replace it with no
  warning and no backup. They now leave your file alone and tell you they did.
  Pass `--force` if you actually want it replaced.

- **`kernic --version` reports the version you have installed.** It answered
  0.1.0 for every version before this one.

- **The README's examples all work.** Running `kernic` opens the visual
  editor, as it has since 0.1.3, and the terminal wizard is `kernic wizard`.
  Two other examples pointed at commands that were not there, and now match
  what kernic does.

**Studio (still in beta):** font picking reaches every Google Font, searches
as you type, and works from the keyboard. It is also much faster, and it no
longer repeats the same font requests often enough for Google to start refusing
them. Studio's local server has been hardened: it now refuses requests from
other sites on your machine, and can no longer be tricked into writing outside
its own folder. If you use `kernic studio`, this release is worth taking.

---

## 0.1.5 (2026-08-27)

**Two bugs in how systems are saved and listed.** One corrupted file used to
take down the whole list, hiding every other system you had. And a migration
from an older config folder could delete the old folder without having moved
anything out of it.

---

## 0.1.4 (2026-08-27)

**A full test suite, and a check that runs on every change.** Nothing you can
see, but it is why the bugs above were found at all.

---

## 0.1.3 (2026-08-27)

**Running `kernic` now opens the visual editor.** Picking colors is easier to
do by eye than by typing. The terminal walkthrough is still there, and is now
`kernic wizard`.

---

## 0.1.2 (2026-08-26)

**You name your system at the end, not the start.** Naming a thing before you
have seen it is harder than naming it after.

---

## 0.1.1 and earlier (2026-08-25)

The first public releases.

- **Design systems from one command.** Colors built with real color science so
  every shade stays even, font pairings from the full Google Fonts catalogue,
  text sizes, corner radii and gradients.
- **Eight styles and a set of finished looks** to start from, including a
  gradient style for fintech-flavoured products.
- **Exports** as CSS variables, a Tailwind v4 theme, JSON, or font tags.
- **`kernic context` and `kernic mcp`**, so AI coding assistants can read your
  design system instead of inventing colors as they go.
