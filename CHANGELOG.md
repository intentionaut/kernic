# Changelog

New changes to Kernic.

Kernic is free and open source software we pride ourselves on shipping to help
improve the vibe-coded web.

---

## 0.1.7 (2026-08-30)

Your AI coding assistant can now set up a design system for you, without you
leaving the conversation. Exports finally include the file that makes that
work. And kernic will never overwrite a file it did not write.

**What this gives you:**

- **Ask your coding assistant to style your app, and it can.** kernic could
  already show an assistant your colors and fonts. It could not put them into
  your project. Now it can. Ask Claude Code or Cursor to apply your design
  system and it writes the files, then tells you the one line to add so every
  future session picks it up. It can also create a system from scratch if you
  do not have one yet, so you are never stuck at an empty list.

- **Your assistant can see all 33 looks, not just the 8 styles.** A look is a
  finished decision: colors, fonts, corners and text sizes, all chosen to go
  together. Your assistant could only see the broad styles before. Now it can
  offer you the finished ones.

- **Exporting everything now includes `design.md`.** This is the file that
  tells an AI assistant which colors and fonts to use, and to stop inventing
  its own. It was the one file `kernic export -f all` left out, which is
  exactly backwards. You can also export it on its own with `-f design-md`,
  and export standard W3C design tokens with `-f dtcg`.

- **`kernic apps` shows your design across every project you have used it in.**
  One command, one list. If a project has fallen behind because you changed the
  system since, it says so, and prints the exact command to bring it back.

- **kernic will not overwrite a file it did not write.** `tokens.json` is also
  the filename Style Dictionary, Tokens Studio and Figma Tokens use. If you had
  one, `kernic context` and `kernic export -o` used to replace it with no
  warning and no backup. They now leave your file alone and tell you they did.
  Pass `--force` if you actually want it replaced.

- **`kernic --version` tells the truth.** It reported 0.1.0 no matter which
  version you had installed.

- **The docs describe the right first command.** Running `kernic` has opened
  the visual editor since 0.1.3, but the README still said it started the
  terminal wizard. That is `kernic wizard`. Two other examples named things
  that do not exist, and are fixed.

**Studio (still in beta):** picking a font works properly again. You can reach
every Google Font instead of an arbitrary 30, search as you type, and pick with
the keyboard. It is also much faster, and no longer requests the same fonts so
often that Google starts refusing them. Studio's local server has been
hardened: it now refuses requests from other sites on your machine, and can no
longer be tricked into writing outside its own folder. If you use
`kernic studio`, this release is worth taking.

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
