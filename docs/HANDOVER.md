# Handover, 2026-10-08

State of `main` when Claude and Codex stopped, and what remains. Read
AGENTS.md, DESIGN.md and IMPLEMENTATION_PLAN.md (Phases 7–8 and the latest
records) first.

## Done

- Phases 0–6, a Claude audit with fixes (record "Claude audit and fixes,
  2026-10-08" in IMPLEMENTATION_PLAN.md), and the Phase 7 public API facade
  and external plugins (`src/host/api/`, tests in `test/unit/api/`). On
  `main`, `pnpm check` passed with 453 of 453 tests.
- The editor follows Obsidian's default look: a proportional font, a centred
  700 px column, and faint line numbers with no gutter panel. Styles are
  plain CSS: `src/webview/styles/` plus one `<plugin>.css` per plugin,
  bundled through `src/webview/styles/index.css`. Do not reintroduce
  `EditorView.baseTheme` style objects.
- Backlinks and Outgoing Links are off by default (owner decision).
- `test/fixtures/vault/` has one note per feature, for manual testing.

## Unfinished work on branch `codex/logging-wip`

A first pass at §5.7 logging: a "Markdown Workbench" output channel, panel
and webview loggers, webview log forwarding, and the
`markdownWorkbench.debug.logging` setting. It does not type-check
(`src/plugins/editor/panel.ts`: `debugLogging` may be undefined) and has no
tests. Finish it or redo it.

## Remaining, in order

1. Missing DESIGN requirements, each with unit tests:
   - §5.7 logging (see the branch above). The root kernel logs to a
     LogOutputChannel. Panel kernels (`createPanel`) and the webview must
     not stay silent. The webview forwards logs over RPC at warn and above,
     and at debug too when `markdownWorkbench.debug.logging` (default false)
     is on.
   - §6.5 commands: "Manage Plugins" (Settings filtered to plugin switches)
     and "Show Plugin Status" (a quick pick of the active editor's plugin
     states, reusing `src/shared/plugin-state.ts`).
   - §25.2 command "Use Markdown Workbench for Markdown in This Workspace"
     (writes the workspace's `workbench.editorAssociations`).
2. Finish Phase 7:
   - API.md, with a complete example external plugin that sets markers and
     claims a link scheme.
   - The `dist/api/` declarations (`tsconfig.api.json` emits them).
   - The Phase 7 completion record.
3. Phase 8, as planned:
   - `pnpm package` builds the VSIX, with a `.vscodeignore` allowlist and
     THIRD_PARTY_NOTICES.md.
   - A native smoke run against the packaged VSIX.
   - README, CAPABILITIES.md and CHANGELOG.md.
   - A sample external plugin in `test/fixtures/sample-plugin/`.
   - docs/MANUAL_TEST_PLAN.md rewritten by plugin (not by phase, with no
     stale status sections), using the fixture vault, plus instructions for
     installing the VSIX into an isolated profile.
4. Documentation that is now wrong:
   - DESIGN §13: Backlinks and Outgoing Links default to off.
   - DESIGN §19: the CSP includes `connect-src ${cspSource} blob:`.
   - docs/PARITY.md and the manual plan, for the same two points.
   - Plugin READMEs that mention removed style objects.
5. Minor: block widgets that are not rendered yet show no line numbers.

## Rules

- Before each commit, run `pnpm check`. Also run `pnpm test:browser` when
  webview code changes, and `pnpm test:vscode` for native wiring and
  Phase 8. Never run two at once.
- Follow AGENTS.md's code norms. Never raise a limit, add a lint exception
  or weaken a test: `test/unit/lint-rules.test.ts` enforces this. A bug fix
  gets its own commit and a unit test.
- Never modify ~/Code/human-learning (the source being ported, at ff3a902e)
  or ~/Code/vscode-embedPDF. Reading them is fine.
- Obsidian is a behaviour reference only. Never copy its code, CSS or
  assets, and never open the owner's vaults.
- Native tests use isolated `/tmp` profiles, never the owner's VS Code or
  Cursor profiles.
- Leave "verify" key bindings unbound.
