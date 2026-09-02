# Contributing

PRs welcome — especially new vibes and looks, and export targets (SCSS, Figma variables). This codebase is and stays 100% MIT.

## Formats kernic writes

kernic adopts formats the ecosystem has standardised on and writes its own code for them: Google's DESIGN.md spec, W3C Design Tokens 2025.10, the shadcn registry item, Tailwind v4 `@theme`. No runtime dependency does the writing. The spec version kernic targets is pinned in `src/context.ts` (`DESIGN_MD_SPEC`); Google's spec is at `alpha` and will change, so `context.test.ts` runs Google's own linter (`@google/design.md`, a dev dependency) over generated files and fails when the format moves. A change to the spec is a change to that constant, the writer, and the changelog, together.

Contrast is measured with the WCAG 2.x ratio. APCA is not used: the reference implementation is not under a permissive licence, and a clean-room port is not worth carrying yet.

## Writing

Anything a person reads (the changelog, the README, CLI output, error messages,
Studio copy) follows [`docs/voice.md`](docs/voice.md). Changelog entries have
their own hard rules at the top of [`CHANGELOG.md`](CHANGELOG.md): benefit
first, five bullets, plain words measured against a reader who codes.

## Testing

kernic uses [Vitest](https://vitest.dev) for unit and integration tests, colocated with source as `src/**/*.test.ts`. Run `npm test` (or `npm run test:watch` while developing).

New code — new exported functions, new CLI commands, new Studio API routes — needs tests before merge; bug fixes should add a regression test that fails without the fix. Pure logic (color math, exporters, token builders) should stay close to fully covered; I/O-heavy code (filesystem, network, the Studio HTTP server) should isolate side effects rather than touching your real `~/.config/kernic` or the network:

- Point filesystem-dependent tests at a temp directory via the `KERNIC_HOME_DIR` env override, instead of mocking `node:os`.
- Stub `fetch` per test (`vi.stubGlobal`) rather than hitting the real Google Fonts endpoint — `src/test/setup.ts` throws on any unstubbed call, so a forgotten stub fails loudly instead of silently reaching the network in CI.
- See `src/test/fixtures.ts` for the shared `DesignSystem` fixtures reused across `export.test.ts`, `context.test.ts`, `shadcn.test.ts` and `mcp.test.ts`.
- The DESIGN.md conformance test spawns Google's linter as a child process; that is the one test allowed to leave the process, and it touches no network.

CI runs `vitest run --coverage` on every push/PR and blocks merge below the project's coverage floor (currently 75% lines/statements/functions, 70% branches — see `vitest.config.ts`). If a change genuinely can't be tested (e.g. it only touches `openBrowser`'s real OS `spawn` call), mock the boundary rather than skipping the test, or explain why in the PR description.
