# Handover, 2026-10-09

State of branch `continue-handover` (PR against `main`) and what remains.
Read AGENTS.md, DESIGN.md and IMPLEMENTATION_PLAN.md (the Phase 7
completion and Phase 8 records) first.

## Done

- Phases 0–8. Phase 7 and 8 records are in IMPLEMENTATION_PLAN.md. Checks:
  `pnpm check` 483/483, browser smoke 14/14, native smoke 1/1 against the
  packaged VSIX.
- §5.7 logging (`src/host/logging.ts`, `src/plugins/editor/logging.ts`),
  §6.5 **Manage Plugins** and **Show Plugin Status**
  (`src/host/api/management.ts`), §25.2 **Use Markdown Workbench for
  Markdown in This Workspace** (`src/plugins/editor/associations.ts`). The
  `codex/logging-wip` branch is superseded and can be deleted.
- API.md, `dist/api` declarations (type-checked by
  `test/unit/api/declarations.test.ts`), the sample external plugin
  (`test/fixtures/sample-plugin/`, built by `pnpm sample`).
- `pnpm package` with an allowlist `.vscodeignore` and generated
  `THIRD_PARTY_NOTICES.md` (`pnpm notices` regenerates it after dependency
  changes; `pnpm package` fails while it is stale).
- README, CAPABILITIES.md, CHANGELOG.md, and `docs/MANUAL_TEST_PLAN.md`
  rewritten by plugin, starting with an isolated-profile install.
- Fixes, each with a unit test: application-scheme links in rendered blocks,
  setext underlines, nested quote bars, checked-task styling in Live Preview
  (`data-task` on lines, checkboxes and list items), line numbers beside
  rendered blocks. DESIGN §13/§19, PARITY.md and plugin READMEs corrected.
- Footnotes redesigned after Obsidian's Live Preview: superscript numbers in
  reading order, hover previews, click to the definition, definitions kept
  as source with a muted marker (no definition widget or back-references).
- The editor follows Obsidian's default look with plain CSS:
  `src/webview/styles/` plus one `<plugin>.css` per plugin. Do not
  reintroduce `EditorView.baseTheme` style objects.
- Backlinks and Outgoing Links are off by default (owner decision).

## Remaining

1. Phase 9, owner acceptance: run `docs/MANUAL_TEST_PLAN.md` against the
   VSIX and fill `docs/PARITY.md`. Nothing in it has been run by hand.
2. Visual differences seen beside Obsidian but not yet changed (check them
   in the acceptance pass first):
   - Quote text is muted; Obsidian's default theme keeps quote text at
     normal colour.
   - Nested list items indent less than in Obsidian.
   - Fold chevrons show whenever the pointer is over the editor; Obsidian
     shows them on the hovered line only.
3. The new commands (Manage Plugins, Show Plugin Status, Use Markdown
   Workbench for Markdown in This Workspace) and logging are unit-tested
   against the VS Code fake; the native smoke does not exercise them.
4. `scripts/test-ledger.mjs` needs the source checkout
   (`~/Code/human-learning`), which was not available; the ledger was not
   regenerated (it has no `todo` rows).
5. Deferred by design: performance measurement (DESIGN §20), webview-side
   external plugins (§18.5), Reading view (§25.8), heading-rename link
   updates.

## Rules

- Before each commit, run `pnpm check`. Also run `pnpm test:browser` when
  webview code changes, and `pnpm test:vscode` for native wiring and
  packaging. Never run two at once. On a shared machine run the native
  suite under `xvfb-run -a`.
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
