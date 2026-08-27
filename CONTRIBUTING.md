# Contributing

PRs welcome — especially new vibes, export targets (SCSS, Figma tokens), and W3C design-tokens output. The cloud Studio lives in a separate private repo; this codebase stays 100% MIT.

## Testing

kernic uses [Vitest](https://vitest.dev) for unit and integration tests, colocated with source as `src/**/*.test.ts`. Run `npm test` (or `npm run test:watch` while developing).

New code — new exported functions, new CLI commands, new Studio API routes — needs tests before merge; bug fixes should add a regression test that fails without the fix. Pure logic (color math, exporters, token builders) should stay close to fully covered; I/O-heavy code (filesystem, network, the Studio HTTP server) should isolate side effects rather than touching your real `~/.config/kernic` or the network:

- Point filesystem-dependent tests at a temp directory via the `KERNIC_HOME_DIR` env override, instead of mocking `node:os`.
- Stub `fetch` per test (`vi.stubGlobal`) rather than hitting the real Google Fonts endpoint — `src/test/setup.ts` throws on any unstubbed call, so a forgotten stub fails loudly instead of silently reaching the network in CI.
- See `src/test/fixtures.ts` for the shared `DesignSystem` fixtures reused across `export.test.ts`, `context.test.ts`, and `mcp.test.ts`.

CI runs `vitest run --coverage` on every push/PR and blocks merge below the project's coverage floor (currently 75% lines/statements/functions, 70% branches — see `vitest.config.ts`). If a change genuinely can't be tested (e.g. it only touches `openBrowser`'s real OS `spawn` call), mock the boundary rather than skipping the test, or explain why in the PR description.
