# Markdown Workbench — implementation plan

Companion to [DESIGN.md](DESIGN.md). It lists the phases in order, what each
must deliver, how to check it, and where every source file goes. Section
numbers such as §12 refer to DESIGN.md.

## Testing policy (changed 7 October 2026, after Phase 3's first record)

The owner will accept the extension by testing it hands-on with computer use.
Automated testing is therefore **unit tests only**:

- Port a source unit test when it still covers behaviour that exists here.
  Write unit tests for new logic (kernel, vault resolution, plugin wiring,
  routing, API) using `test/support/vscode-fake.ts` and in-memory fakes.
- Do **not** port the source browser suites, native suites or fuzzers. Mark
  their ledger rows `retired` with the reason "covered by computer-use
  acceptance (docs/MANUAL_TEST_PLAN.md)".
- Keep the existing small smoke suites (`pnpm test:browser`, 14 tests;
  `pnpm test:vscode`, 1 test) as a quick sanity check. Fix them when a change
  breaks them; do not expand them.
- Instead of browser and native tests, maintain `docs/MANUAL_TEST_PLAN.md`:
  scenarios the owner runs with computer use, grouped by plugin. Each has
  setup (a note in `test/fixtures/vault`), steps and the expected result.
  Draw them from the retired source scenarios and DESIGN §13–§17; one
  scenario may cover several retired tests. Add each plugin's scenarios in
  the phase that delivers the plugin.

This replaces every earlier requirement below to port browser or native
suites, fuzzers or flaky-test investigations. Phase 3's first record is
re-judged under this policy.

## How to work

- Source: `~/Code/human-learning`, branch `claude/markdown-integration`,
  commit `ff3a902ef4ec50a136455c0cf2ccaff698682a06`. Read it with
  `git -C ~/Code/human-learning show ff3a902e:<path>`, or extract it once:

  ```sh
  mkdir -p /tmp/mw-source && git -C ~/Code/human-learning archive ff3a902e \
    packages/markdown-editor packages/vscode-extension/src packages/vscode-extension/test/vscode-e2e \
    docs/markdown-integration.md docs/markdown-integration-handover.md | tar -x -C /tmp/mw-source
  ```

  Never edit any human-learning checkout or worktree.
- Template: `~/Code/vscode-embedPDF`. Copy its toolchain files and adapt them;
  do not change that repository.
- Port behaviour with its unit tests (see Testing policy). Every source test
  has a ledger row in `docs/TEST_LEDGER.md`: ported, rewritten, changed or
  retired with a reason. None is dropped silently.
- Follow "Code norms" in AGENTS.md. New and ported code meets them from the
  start; `pnpm check` enforces the mechanical part.
- Keep each phase's tree green. Run checks in this order, never two at once
  (the smoke suites load built files):

  ```sh
  pnpm check            # format check, lint, typecheck, unit tests, contributions check
  pnpm test:browser     # 14-test smoke suite
  pnpm test:vscode      # 1-test native smoke; opens VS Code; Phase 8 and when native wiring changes
  ```

- At the end of each phase, add a dated record (template at the end) and
  commit with a message naming the phase. Do not push, publish or install into
  the owner's own editor profiles without approval.
- Obsidian is a behaviour reference. Do not copy code, CSS or icons from the
  Obsidian bundle in `~/Code/obsidian-re`. Use a disposable vault for
  comparisons.

## Target tree

```text
vscode-markdown-workbench/
├── AGENTS.md  CLAUDE.md  README.md  DESIGN.md  IMPLEMENTATION_PLAN.md
├── API.md  CAPABILITIES.md  CHANGELOG.md  THIRD_PARTY_NOTICES.md  LICENSE
├── docs/          MANUAL_TEST_PLAN.md  PARITY.md  TEST_LEDGER.md  images/
├── package.json   pnpm-workspace.yaml  tsconfig*.json  eslint.config.mjs  .vscodeignore
├── scripts/       build.mjs  prism.mjs  generate-contributions.ts  third-party-notices.mjs
│                  measure-editor.ts  test-ledger.mjs
├── src/
│   ├── kernel/    context.ts  fiber.ts  events.ts  services.ts  schema.ts
│   │              protocol.ts  errors.ts  logger.ts  index.ts  README.md
│   ├── shared/    rpc/{envelope,endpoint}.ts  document/{authority,coordinates,wire}.ts
│   │              positions.ts  fuzzy.ts  agent-reference.ts  errors.ts  media-kinds.ts
│   ├── markdown/  dialect/  metadata/  html/  properties/  tables/  search/
│   │              tags/{grammar,tree}.ts  tasks.ts
│   ├── host/      extension.ts  bootstrap.ts  presets.ts  workbench.ts  settings.ts
│   │              transport.ts  api/{types,facade,external}.ts
│   ├── webview/   main.ts  bootstrap.ts  transport.ts  vscode-api.ts
│   │              ui/{menu,edge-scroll,icons,notice}.ts  styles/base.css
│   ├── workers/   vault.ts  search.ts
│   └── plugins/   host.ts  webview.ts  <id>/{manifest,protocol,api,host,webview}.ts …
└── test/
    ├── support/   vscode-fake.ts  memory-fs.ts
    ├── unit/      kernel/  shared/  markdown/  contributions.test.ts
    ├── browser/   smoke suite only (existing 14 tests)
    ├── vscode/    native smoke only (existing 1 test)
    └── fixtures/  vault/ (.obsidian marker; notes used by MANUAL_TEST_PLAN.md)  media/
```

Plugin unit tests sit beside their code (`src/plugins/<id>/*.test.ts`); the
unit command runs `src/**/*.test.ts` and `test/unit/**/*.test.ts`.

## Phase 0 — Repository

Deliver:

- `package.json` with the identity in DESIGN §0, `engines.vscode` `^1.90.0`,
  scripts `build`, `watch`, `typecheck`, `lint`, `test`, `test:browser`,
  `test:vscode`, `check`, `contributions`, `package`, `ledger`.
- tsconfig projects per DESIGN §22. A deliberate import of `vscode` or
  `document` from `src/kernel` must fail typecheck. Keep that as a negative
  check in `test/unit/layers.test.ts`, which runs `tsc` on a fixture.
- ESLint config from PDF Workbench, plus the import boundaries of DESIGN §3
  and §6.1.
- `scripts/build.mjs` producing the outputs of DESIGN §22. In this phase each
  entry may be a stub.
- `AGENTS.md`, `CLAUDE.md` (one line pointing to AGENTS.md), a README stub,
  `LICENSE` (MIT).
- `docs/TEST_LEDGER.md` generated by `scripts/test-ledger.mjs` from the
  source commit. List every unit test title (`tsx --test --test-reporter=spec`)
  and every browser and native scenario (`playwright test --list`), each with
  status `todo`.

Accept: `pnpm install && pnpm check && pnpm build` pass. The ledger lists the
source branch's 106 unit tests, 293 browser scenarios and the Markdown native
scenarios.

## Phase 1 — Kernel, schema and RPC

Deliver `src/kernel` (DESIGN §5) and `src/shared/rpc` (§8.4):

- `Context`, `Fiber`, `Service`, lifecycle states and transitions, service
  gating and replacement, `effect`, child fibers, typed property access with
  `UndeclaredService`.
- Events with the five dispatch modes and per-listener error isolation.
- `Schema` with `parse`, inferred types and `toJSONSchema()`.
- `defineProtocol`, plugin channels, request/response/notify/cancel,
  timeouts, validation of params and results both ways.
- `src/kernel/README.md`: the model, and every difference from Cordis.

Accept: conformance tests cover each bullet, including disposal order (LIFO),
re-gating when a provider stops and returns, `update` with and without
`reconfigure`, failure inside async `apply`, and a dropped invalid message.
Kernel under 800 lines without tests.

## Phase 2 — Pure layers

Port the pure modules with their unit tests (file map below): `shared/`
(authority, coordinates, positions, fuzzy, agent reference, media kinds) and
`markdown/` (dialect with a single parser, metadata, HTML renderer factory,
properties, tables model and operations, search query and evaluation, tags,
tasks, footnotes, fragments).

- Replace the four parser configurations with `markdown/dialect`.
- Build `markdown/metadata` (DESIGN §10.2). Re-express `noteHeadings`,
  `noteFragment`, `noteTags` and `footnotes` over it, keeping their tests
  green.
- Split `render.ts` into `markdown/html/*` and `createRenderer()`; move
  `renderProperties` out (it goes to the `properties` plugin in phase 4).
- Replace `shared/match.ts` with `shared/fuzzy.ts` (Obsidian scoring, study
  §8) and update its tests to the new ranking; record the change in the
  ledger.
- Port `formatMarkdownAgentReference` and its tests from
  `vscode-extension/src/agentClipboard.ts` (Markdown part only).

Accept: every ported unit test passes; the ledger shows them `ported`.

## Phase 3 — Core plugins and a working editor

Deliver the core plugins of DESIGN §13 except `vault` (stub its service with
the source's resolution behaviour behind the `VaultIndex` interface) and
`markers`:

- `document` (§8): session, authority, undo groups, save, flush through
  `document/willSave`; webview synchronizer and input groups.
- `editor` (§9): provider, panels, panel, view transfer, webview HTML;
  webview `EditorView`, compartments, precedence slots, `menu`, theme, focus,
  reveal, view state and presentation.
- `dialect`, `render` (§10.4), `livePreview` (§11) with the renderer registry
  and the basic-syntax renderers, and Source mode.
- `commands` (§14) with `save`, `undo`, `redo`, `close`, `saveClose`,
  `openAsText`.
- `resources` (§12.4).
- Host and webview bootstraps and presets: `minimal` and `obsidian` (which,
  at this phase, equals the core plugins).
- Browser harness: `test/browser/fake-host.ts` speaking the new RPC (done;
  smoke suite only).

Still to finish (from the first Phase 3 record): source block rendering
through the new registry and `render` service, clipboard routing,
structural block motion (ArrowUp/Down over blocks, Escape out of block
source), and the remaining view-transfer behaviour.

Accept: the items above work; unit tests cover the core logic you can test
without a browser (document session and authority, undo groups, flush and
save ordering, view-state capture and restore, reveal rule, renderer registry
add and remove, Source mode switching); a kernel-level test shows
`livePreview` off gives plain source with no widget; the smoke suites pass;
`docs/MANUAL_TEST_PLAN.md` exists with core scenarios (typing, save, undo and
redo, two panels of one note, external edit, CRLF, Source mode, reveal around
the caret, Escape and arrow motion over blocks, window reload recovery).

## Phase 4 — Feature plugins

Port each feature into its plugin (DESIGN §13), with its tests, in this order
so that dependencies exist first:

1. `folding`, `lineNumbers`, `indentGuides`, `spellcheck`, `autoPair`,
   `smartLists`, `vim` (setting-backed; remove the `workspaceState` toggle)
2. `formatting` (restore the editor commands; DESIGN §14)
3. `links` (rendering and clicks; host opening via `links/open`, §16)
4. `codeBlocks`, `math`, `diagrams`, `callouts`, `footnotes`, `tasks`
5. `embeds` (with `media/*`), `pagePreview`
6. `properties` (all of `editor/properties`, the sheet HTML, type store keyed
   by vault root)
7. `tables` (split `controller.ts` into selection, keyboard, menu and edit
   projection modules, each under 400 lines)
8. `inlineTitle` (rename and view transfer)
9. `tags` (inline part), `suggest` (framework plus link, heading and tag
   sources), `search` (query blocks; file listing through the vault stub)
10. `pasteHtml`, `copyForAgent`, `markers` (generalized from
    `query-annotations.ts`)

For each plugin:

- manifest, README, settings and contributions through the generator;
- unit tests for its logic (ported source unit tests, plus new ones for code
  that has none);
- a kernel-level toggle unit test: disabling the plugin removes its
  renderers, post-processors, commands and RPC handlers, and enabling it adds
  them again;
- its section in `docs/MANUAL_TEST_PLAN.md`, drawn from its retired browser
  and native scenarios (`table.spec.ts`, `table-drag.spec.ts`,
  `property-*.spec.ts`, `file-title.spec.ts`, `suggest.spec.ts`,
  `source-links.spec.mts` and the native specs), including turning the plugin
  off and on in Settings.

Accept: every plugin above is delivered with the items listed; `pnpm check`
and the smoke suites pass; every browser and native ledger row is retired
with the policy reason and reflected in the manual test plan.

## Readability pass (after Phase 4 step 7, before step 8)

Added on 8 October 2026, after the owner reviewed the code: files were split
to meet the size limits, but most long source functions were moved unchanged,
and the tables controller was spread across files as `this:` functions. The
owner has added Prettier, the ESLint limits in AGENTS.md ("Code norms") and
the backlog `eslint.legacy.mjs` (86 files: 66 with functions over 60 lines,
33 over complexity 15, 13 with more than 4 parameters, 19 with nested
ternaries, 1 nested too deeply, 6 with the `this:` pattern).

1. Commit the owner's uncommitted tooling change as it is (Prettier and
   ESLint configuration, `eslint.legacy.mjs`, `AGENTS.md`, `DESIGN.md` and
   this section, the formatting and automatic fixes, and the kernel size
   budget raised to 1,000 formatted lines). Review it first; if something is
   wrong, fix it in a separate commit. Message: "Code norms: formatting,
   lint limits and readability backlog".
2. Rewrite the backlog, one plugin or module per commit ("Readability:
   tables"), worst first:
   - `tables`: replace the `this: TableController` functions with
     collaborators that each receive only the state they need (selection,
     keyboard, clipboard, menu, edit projection), so that a reader can follow
     a keystroke without opening every file;
   - `properties` (`controls`, `chips`, `lists`), `pagePreview` (`controller`);
   - `host/workbench.ts`, the `editor` and `footnotes` `apply` functions;
   - `markdown/search/evaluate.ts`, `markdown/metadata/footnote-extract.ts`;
   - everything else in `eslint.legacy.mjs`.
   Remove each file from the backlog as it complies. When every list is
   empty, delete `eslint.legacy.mjs` and the backlog block in
   `eslint.config.mjs`.
3. Rewrite every plugin README to the template in AGENTS.md, and move status
   lines from READMEs into the phase records. Add why-comments where a reader
   would otherwise have to rediscover an invariant (start with the kernel's
   fiber generations and the Context proxy).
4. Rewrites preserve behaviour. Extracted pure logic gets unit tests; the
   unit test count never goes down. A bug found while rewriting gets its own
   commit with a unit test. Run `pnpm check` before every commit and the
   browser smoke suite before every commit that touches webview code.
5. Add a "Readability pass regressions" section to `docs/MANUAL_TEST_PLAN.md`
   listing each rewritten plugin and the existing scenarios the owner should
   rerun for it.

Accept: `eslint.legacy.mjs` is gone; any inline `eslint-disable` added has a
reason and is listed in the record; READMEs follow the template; `pnpm check`
and the smoke suites pass; a dated record "Readability pass — <date>" gives
the backlog counts before and after per rule, the files rewritten, bugs
found, and the unit test count before and after.

## Phase 5 — Vault index and host features

**Owned by Claude, in parallel (added 8 October 2026).** Claude implements
this phase on the branch `claude/phase5-vault` in the worktree
`~/Code/vscode-markdown-workbench-phase5` and merges it into `main` when its
record "Phase 5 (completed)" is written. Codex does not work on Phase 5 and
does not edit that worktree or branch. Build Phase 4's `suggest`, `tags` and
`search` against the `VaultIndex` interface in `src/plugins/vault/api.ts`;
the stub keeps working until the real index replaces it behind the same
interface. Do not change that interface: if you need more from the vault,
record what under "Known issues". When Phase 4 is complete and Phase 5 is not
yet on `main`, end the run with your summary instead of starting Phase 6.

- `vault` (DESIGN §12): file map, unique-basename lookup, worker parsing,
  persistence, link maps with incremental re-resolution, open-document
  overlay, ignore rules, `vault/changed` and `vault/resolved`.
- Move `resources`, `suggest` sources, `tags` search and `search` file listing
  to the index, and delete the stub.
- Unresolved-link styling (`links`).
- Host views: `outline` (tree view and `DocumentSymbolProvider`), `backlinks`
  (with unlinked mentions and status bar count), `outgoingLinks`, `tags` view.
- `linkUpdates`, `quickSwitcher`, `wordCount`.

Accept: link-resolution table tests for each step of DESIGN §12.3; unit
tests for incremental re-resolution, persistence round trip and the
open-document overlay (in-memory file system); a unit test that a rename
produces one `WorkspaceEdit` rewriting links in other notes while keeping
aliases and subpaths; a script (`scripts/measure-vault.ts`) that indexes a
generated 10,000-note vault and reports the longest host block and warm-start
time, with results in the phase record; manual test plan sections for the
views, quick switcher, rename and word count.

## Phase 6 — Commands, settings and Obsidian parity pass

- Every command in DESIGN §14 is registered and routed. Unit tests check that
  each manifest command maps to a registered webview or host command, and
  test the pure editing commands (formatting, headings, lists, swap lines) on
  `EditorState` without a browser.
- Every setting in DESIGN §15 exists with Obsidian's default and is read
  through the plugin config.
- Leave every "verify" key binding unbound and list it in the manual test
  plan for the owner to confirm in Obsidian.
- Start `docs/PARITY.md` (DESIGN §21.4) with one row per behaviour, status
  "not observed" until the owner's computer-use pass.

Accept: `pnpm check` confirms contributions and command routing; every
command and setting appears in the manual test plan; parity rows exist for
every behaviour in §13–§15.

## Phase 7 — Public API v1

- `src/host/api/types.ts` (DESIGN §18.1), the frozen facade, external host
  plugins in an isolated context (§18.2), markers (§18.3), selection and
  title actions and code block processors (§18.4).
- `API.md` written like PDF Workbench's, with a complete example external
  plugin that sets markers and claims a link scheme.
- `dist/api/` declarations from the same typechecked source.

Accept: unit tests drive the API facade against `vscode-fake` and cover every
member, including two panels of one note, a dirty document, a stale
selection, plugin disable and re-enable, external plugin isolation (no access
to internal services) and marker mapping across edits. No probe extension.

## Phase 8 — Packaging, documentation and hand-over for acceptance

- `pnpm package` produces a VSIX; `.vscodeignore` allowlist;
  `THIRD_PARTY_NOTICES.md`.
- Run the native smoke test once against the packaged VSIX.
- README, API.md, CAPABILITIES.md and CHANGELOG.md. Screenshots are optional.
- Finish `docs/MANUAL_TEST_PLAN.md`: every plugin, command and setting, the
  API example from API.md (a sample external plugin under
  `test/fixtures/sample-plugin/` the owner can install), and how to install
  the VSIX into an isolated profile for testing.

Accept: the VSIX builds and the native smoke passes against it; the ledger has
no `todo` rows; the manual test plan covers DESIGN §13–§18; documentation
matches behaviour.

## Phase 9 — Owner acceptance (not Codex)

The owner tests the VSIX with computer use against `docs/MANUAL_TEST_PLAN.md`
and fills `docs/PARITY.md` against the live Obsidian reference. Fixes found
there become follow-up work. Performance measurement (DESIGN §20) and the
webview-module import-map prototype (§18.5) are deferred.

## Source → destination map

Paths on the left are under `packages/markdown-editor/` unless they start with
`vscode-extension/` (meaning `packages/vscode-extension/`). "split" means the
file's parts go to the listed places.

### shared and markdown

| Source | Destination |
| --- | --- |
| `src/shared/protocol.ts` | split: `src/shared/rpc/*`, `src/shared/document/wire.ts`, per-plugin `protocol.ts`, view-state schema in `plugins/editor/protocol.ts` |
| `src/shared/authority.ts` | `src/shared/document/authority.ts` |
| `src/shared/source-coordinates.ts` | `src/shared/document/coordinates.ts` |
| `src/shared/positions.ts` | `src/shared/positions.ts` |
| `src/shared/match.ts` | replaced by `src/shared/fuzzy.ts` |
| `src/shared/media.ts` | `src/shared/media-kinds.ts` |
| `src/shared/tag.ts` | `src/markdown/tags/grammar.ts` |
| `src/shared/tag-tree.ts` | `src/markdown/tags/tree.ts` |
| `src/shared/task.ts` | `src/markdown/tasks.ts` |
| `src/shared/property-types.ts` | `src/markdown/properties/types.ts` |
| `src/shared/host-event.ts` | `src/webview/transport.ts` (it uses `window`) |
| `src/shared/edit-group.ts` | `src/plugins/document/input-groups.ts` (webview) |
| `src/markdown/syntax.ts` | split: `src/markdown/dialect/{frontmatter,math,wiki,tags,footnotes,highlight,comments}.ts` |
| `src/markdown/parse.ts` | `src/markdown/dialect/index.ts` |
| `src/markdown/fragments.ts` | `src/markdown/metadata/{headings,fragments}.ts` |
| `src/markdown/footnotes.ts` | `src/markdown/metadata/footnotes.ts` |
| `src/markdown/tags.ts` | `src/markdown/metadata/tags.ts` |
| `src/markdown/render.ts` | split: `src/markdown/html/*`; `renderProperties` → `src/plugins/properties/sheet-html.ts` |
| `src/markdown/properties.ts` | split: `src/markdown/properties/{frontmatter,values,edits}.ts` |
| `src/markdown/property-order.ts` | `src/markdown/properties/order.ts` |
| `src/markdown/paste.ts` | `src/plugins/pasteHtml/convert.ts` (needs the DOM) |
| `src/markdown/icons.ts` | `src/webview/ui/icons.ts` |
| `src/table/model.ts`, `operations.ts` | `src/markdown/tables/{model,operations}.ts` |
| `src/search/query.ts`, `evaluate.ts`, `canvas-model.ts` | `src/markdown/search/{query,evaluate,canvas}.ts` |
| `src/search/worker.ts` | `src/workers/search.ts` |
| `src/media/webm.ts` | `src/plugins/embeds/webm.ts` |

### host

| Source | Destination |
| --- | --- |
| `src/host/document-session.ts` | split: `src/plugins/document/{session,save}.ts`; link opening → `plugins/links/open.ts`; task edits → `plugins/tasks/host.ts`; tags → `plugins/tags/host.ts`; suggest → `plugins/suggest/host.ts`; search → `plugins/search/host.ts`; clipboard → `plugins/editor/clipboard.ts` |
| `src/host/undo-groups.ts` | `src/plugins/document/undo-groups.ts` |
| `src/host/resources.ts` | `src/plugins/resources/host.ts` (containment); resolution → `plugins/vault` |
| `src/host/suggestions.ts` | `src/plugins/suggest/sources.ts` over the vault index |
| `src/host/tag-search.ts` | `src/plugins/tags/search.ts` over the vault index |
| `src/host/query-session.ts` | `src/plugins/search/session.ts` |
| `src/search/runner.ts` | `src/plugins/search/worker-client.ts` |
| `src/host/property-types.ts` | `src/plugins/properties/type-store.ts` (scope = vault root) |
| `vscode-extension/src/markdown/provider.ts` | split: `src/plugins/editor/{provider,panels,panel,view-transfer}.ts`; annotations → `plugins/markers`; property types → `plugins/properties/host.ts`; selection capture → `plugins/copyForAgent/host.ts` |
| `vscode-extension/src/markdown/rename-note.ts` | `src/plugins/inlineTitle/rename.ts` |
| `vscode-extension/src/markdown/webview-html.ts` | `src/plugins/editor/webview-html.ts` |
| `vscode-extension/src/markdownSymbols.ts` | rewrite: `src/plugins/outline/host.ts` (Markdown parts only) |
| `vscode-extension/src/backlinksProvider.ts` | rewrite: `src/plugins/backlinks/host.ts` |
| `vscode-extension/src/linkProvider.ts` | rewrite: `src/plugins/links/document-links.ts` (plain text editor) |
| `vscode-extension/src/agentClipboard.ts` | `formatMarkdownAgentReference` only → `src/shared/agent-reference.ts` |
| `vscode-extension/src/selectionHandoff.ts` | Markdown copy path only → `src/plugins/copyForAgent/host.ts` |
| `vscode-extension/src/wikiLinks.ts`, `localLinkTargetResolver.ts` | not ported (replaced by `vault`) |

### webview

| Source | Destination |
| --- | --- |
| `src/editor/main.ts`, `webview.ts` | `src/webview/{main,vscode-api}.ts` |
| `src/editor/app.ts` | split: `src/webview/bootstrap.ts`; extension assembly → `plugins/editor/webview.ts`; link clicks → `plugins/links/clicks.ts`; annotations → `plugins/markers/webview.ts`; reveal → `plugins/editor/reveal.ts`; tasks → `plugins/tasks/webview.ts`; Cmd/Ctrl+; → `plugins/properties` manifest key |
| `src/editor/sync.ts`, `input-groups.ts` | `src/plugins/document/{sync,input-groups}.ts` |
| `src/editor/chrome.ts`, `theme.ts`, `keymap.ts` | `src/plugins/editor/{chrome,theme,keymap}.ts`; `leaveBlockSource` → `plugins/livePreview/escape.ts` |
| `src/editor/presentation.ts`, `view-state.ts` | `src/plugins/editor/{presentation,view-state}.ts` (outline panel parts removed) |
| `src/editor/document-tree.ts` | `src/plugins/livePreview/document-tree.ts` |
| `src/editor/hybrid-inline.ts` | split: `plugins/livePreview/inline.ts` (engine and basic syntax); `TagWidget` → `plugins/tags`; `TaskBox` → `plugins/tasks`; footnotes → `plugins/footnotes`; wikilinks and links → `plugins/links`; `InlineWidget` for math, embeds and images → owning plugins |
| `src/editor/hybrid-blocks.ts` | split: `plugins/livePreview/{block-index,block-decorations,block-widget,reveal}.ts`; properties display → `plugins/properties`; table branch → `plugins/tables`; footnote branch → `plugins/footnotes` |
| `src/editor/rendered-position.ts` | `src/plugins/livePreview/rendered-position.ts` |
| `src/editor/render/content.ts`, `context.ts`, `sanitize.ts`, `clicks.ts`, `disclosure.ts` | `src/plugins/render/*`; disclosure → `plugins/callouts` |
| `src/editor/render/embeds.ts` | `src/plugins/embeds/post-process.ts` |
| `src/editor/render/search-blocks.ts` | `src/plugins/search/webview.ts` |
| `src/editor/render/tasks.ts` | `src/plugins/tasks/post-process.ts` |
| `src/editor/render/typeset.ts` | split: `plugins/math`, `plugins/diagrams`, `plugins/codeBlocks` |
| `src/editor/math.ts` | `src/plugins/math/mathjax.ts` |
| `src/editor/code-source.ts`, `code-highlight.ts`, `code-selection.ts` | `src/plugins/codeBlocks/*` |
| `src/editor/footnote-widget.ts` | `src/plugins/footnotes/reference-widget.ts` |
| `src/editor/properties/*` | `src/plugins/properties/*` |
| `src/editor/file-title.ts` | `src/plugins/inlineTitle/webview.ts` |
| `src/editor/suggest.ts` | `src/plugins/suggest/webview.ts` |
| `src/editor/link-preview.ts` | `src/plugins/pagePreview/webview.ts` |
| `src/editor/outline.ts` | split: heading folding → `plugins/folding`; heading index → `src/markdown/metadata/headings.ts`; panel → removed (DESIGN §13 outline) |
| `src/editor/clipboard.ts` | split: `plugins/editor/clipboard.ts`; property routing → `plugins/properties/clipboard.ts`; HTML paste → `plugins/pasteHtml` |
| `src/editor/markdown.ts` | split: `autoPairing` → `plugins/autoPair`; `wrapSelection`, `clearInlineFormatting` → `plugins/formatting` |
| `src/editor/vim.ts` | `src/plugins/vim/webview.ts` |
| `src/editor/query-annotations.ts` | `src/plugins/markers/webview.ts` (generalized) |
| `src/editor/resources.ts` | `src/plugins/resources/webview.ts` (RPC client) |
| `src/editor/menu.ts`, `edge-scroll.ts` | `src/webview/ui/{menu,edge-scroll}.ts` (`menu` service from `editor`) |
| `src/editor/styles/*.css` | each stylesheet to its plugin; `base.css` and `markdown.css` (basic syntax) stay core |
| `src/table/*` (except model and operations) | `src/plugins/tables/*`; `controller.ts` split |
| `src/search/client.ts` | `src/plugins/search/client.ts` |
| `src/media/image.ts`, `image-dialog.ts`, `image-dialog.css` | `src/plugins/embeds/*` |

### tests, scripts and fixtures

| Source | Destination |
| --- | --- |
| `test/*.test.ts` | `test/unit/**` or beside the owning plugin |
| `test/browser-host.ts` | `test/browser/fake-host.ts` (new RPC) |
| `test/editor-harness.ts`, `page-server.ts`, `browser-setup.ts` | `test/browser/{harness,page-server,setup}.ts` |
| `test/*.spec.ts`, `source-links.spec.mts` (browser) | not ported; scenarios go into `docs/MANUAL_TEST_PLAN.md` |
| `test/vscode-integration.ts` | not ported; its document-session cases become unit tests against `vscode-fake` |
| `test/performance-fixtures.mts`, `scripts/measure-editor.ts` | deferred (Phase 9) |
| `test/fixtures/*` | `test/fixtures/media/` (for manual-test notes) |
| `vscode-extension/test/vscode-e2e/{markdown,properties,file-title,rename-state,obsidian-commands}.spec.ts` | not ported; scenarios go into `docs/MANUAL_TEST_PLAN.md` |
| `vscode-extension/test/vscode-e2e/fixtures/test-vault` | `test/fixtures/vault` (add `.obsidian/`; remove LLM Wiki files) |
| `scripts/build.mjs`, `prism.mjs` | `scripts/build.mjs` (all outputs), `scripts/prism.mjs` |

## Test ledger

`docs/TEST_LEDGER.md` has one row per source test or scenario:

| Source | Title | Status | Destination or reason |
| --- | --- | --- | --- |
| `browser.spec.ts` | "plain click opens a rendered link" | ported | `test/browser/links.spec.ts` |
| `match.test.ts` | "ranks prefix matches first" | rewritten | `src/shared/fuzzy.test.ts` (Obsidian scoring) |

Statuses: `todo`, `ported`, `rewritten` (same behaviour, new API), `changed`
(behaviour changed on purpose; cite DESIGN), `retired` (cite the reason, for
example an LLM Wiki-only behaviour). Phase 8 cannot finish with `todo` rows.

## Phase record template

```markdown
### Phase N — <name>, <date>

Delivered: <one paragraph>.
Checks: `pnpm check` (<unit count> passed), `pnpm test:browser` (<n>/<n>),
`pnpm test:vscode` (<n>/<n> or not run: reason).
Ledger: <ported>/<rewritten>/<changed>/<retired>/<todo> counts.
Deviations from DESIGN.md: <none, or what and why>.
Known issues: <list, with the failing test or observation>.
```

## Phase records

### Phase 0 — Repository, 2026-10-07

Delivered: single-package pnpm toolchain adapted from PDF Workbench, strict
pure/host/webview/plugin/worker TypeScript projects, import-boundary linting,
negative platform-import checks, all five build outputs (stub entries), and a
reproducible source ledger with raw runner evidence. The pinned archive's 106
unit tests passed while inventorying; Playwright listed 293 browser and 47
Markdown native scenarios. Source repositories were read only.
Checks: `pnpm install` passed; `pnpm check` (5 unit tests passed),
`pnpm test:browser` (1/1 build smoke), `pnpm build` passed as part of that
command; `pnpm test:vscode` (not run: no native behaviour in this phase).
Ledger: 0/0/0/0/446 (ported/rewritten/changed/retired/todo).
Deviations from DESIGN.md: use the available pnpm 10.28.2, pinned in the package,
instead of the template's pnpm 12.9.1. Archive the source test helpers as well
as the listed directories because `source-links.spec.mts` imports them.
All §25 recommended defaults are adopted. Pure projects map platform modules
to a deliberately invalid fixture because `types: []` alone does not prohibit
an explicit `vscode` import.
Known issues: no editor implementation yet (scheduled Phase 3). Native test
command has no scenarios until native behaviour is introduced. Dependency
install left optional signing/keychain native build scripts disabled; no
signing or publishing is performed.

### Phase 1 — Kernel, schema and RPC, 2026-10-07

Delivered: 608-line dependency-free kernel, plugin and Service fibers, required
and optional injection, replaceable service stacks, async lifecycle rollback,
LIFO effects and child disposal, all five event modes with listener isolation,
configuration schemas and JSON Schema output, and namespaced validated RPC with
request/response/notifications/cancellation, deadlines and channel disposal.
Conformance includes withdrawal during async loading and late registration after
disposal. A Chromium test runs the same kernel source. README documents semantics.
Checks: `pnpm check` (29 unit tests passed), `pnpm test:browser` (2/2),
`pnpm test:vscode` (not run: pure infrastructure, no native behaviour).
Ledger: 0/0/0/0/446 (ported/rewritten/changed/retired/todo).
Deviations from DESIGN.md: service publication is atomic after successful apply;
optional injection changes restart consumers. Root Context has no owning fiber.
RPC cancellation and clock interfaces are platform-neutral injected adapters.
These decisions prevent partial async providers and keep pure layers platform-free.
Known issues: external API service isolation remains scheduled for Phase 7;
no editor implementation until Phase 3.

### Phase 2 — Pure layers, 2026-10-07

Delivered: document authority and LF/source coordinates, position/media helpers,
Markdown agent-reference formatter, independently implemented fuzzy scoring,
one shared Lezer dialect and CodeMirror language support, unified cached metadata,
HTML renderer factory with syntax modules, YAML parsing/value/structural edits,
table model/operations, search query/evaluation, tags, tasks and footnotes.
Metadata backs headings, fragments, tags and footnotes and includes link ranges,
reference links, embeds, YAML links, blocks, aliases, sections and task items.
All new production modules are below 400 lines. Renderer configuration isolation
and the pure layers are exercised in Chromium as well as unit tests.
Checks: `pnpm check` (118 unit tests passed), `pnpm test:browser` (3/3),
`pnpm test:vscode` (not run: no native behaviour).
Ledger: 78/4/2/0/364 (ported/rewritten/changed/retired/todo); total 448, including
two additional Markdown-only adapter tests from `agentClipboard.test.mjs`.
Deviations from DESIGN.md: property sheet HTML and open-source Lucide icon
helpers are staged in their destination modules early to retain the source's
property rendering tests; no properties plugin is registered yet. Fences use
`data-fence` and encoded `data-source` rather than source-specific diagram/query
attributes, per §10.3. The fuzzy scorer uses the study's stated formula and CJK
tokenization; exact live-reference parity is reserved for the parity audit.
The tag suite's mixed grammar/RPC row remains todo until its original RPC
assertions can target the Phase 4 channel; passing grammar assertions alone do
not complete that row. The remaining protocol, host, UI and folding tests remain
scheduled with their owners. Ledger regeneration now preserves existing statuses
and supplementary adapter rows.
Known issues: live-reference fuzzy tie/range parity is not observed; no native
editor yet. Attachment and platform-specific agent references remain host work.

### Phase 3 — Core plugins and a working editor, 2026-10-07

**Incomplete — acceptance criteria not met; phases 4–9 have not started.**

Delivered: host and webview bootstraps and core manifests; one native-authority
session per document; validated RPC per panel; input/undo groups, strict final
save flushing and serialized document actions; a working CodeMirror editor;
owned compartments and precedence slots; basic inline Live Preview and a block
renderer registry; Source mode; sanitized rendering service; menu service;
per-view selection, mode and anchored-scroll capture/restore/persistence;
identity-based view-transfer helpers; contained resources and a temporary
resolver behind `VaultIndex`. The webview transport rejects embedded-site
messages. The native harness packages and installs only into its generated
`/tmp/markdown-workbench-e2e-*` profile, extensions directory and home.

Checks: `pnpm check` (137 unit tests passed), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1 new installed-extension smoke on VS Code 1.140.0).
The native smoke types, saves and undoes through the actual TextDocument.
These are the implemented test subset, not the full source suites. Final logs:
[unit/lint/types](docs/checks/phase3-check.txt),
[browser](docs/checks/phase3-browser.txt),
[native](docs/checks/phase3-native.txt).

Ledger: 85/12/2/0/349 (ported/rewritten/changed/retired/todo), total 448.
No source scenarios were retired or silently dropped.

Deviations from DESIGN.md: temporary vault snapshots are scoped to panel
contexts; Phase 5 must replace these with shared per-vault indexes. Internal
platform-neutral contracts carry URI strings; the workbench converts them to
VS Code Uri objects. The native harness is introduced earlier than Phase 8 to
validate native work immediately. Pure metadata fields are composed explicitly
with the Live Preview document-tree field in the rewritten source tests. A
strict document flush follows the error-isolating `document/willSave` hook so
listener isolation cannot accidentally permit a stale save. The kernel Proxy
reserves `then` for Promise assimilation. Fuzzy matching now preserves original
UTF-16 ranges across Unicode normalization and tokenizes CJK after Latin text.

Known issues / acceptance gate:
- `keystroke-fuzz.spec.ts` and `command-fuzz.spec.ts` are not ported. No claim is
  made for the required 18,112 edits or 128 Vim sequences. Their editing and
  command adapters still need migration to the service model.
- The remaining core portions of `integration.spec.ts`, `view-state.spec.ts`
  and `browser.spec.ts` are not fully migrated. Renderer/clipboard interaction,
  structural block motion and complete view-transfer regressions are missing.
- The generic rendering pipeline is present, but all source block-rendering
  integration is not complete. Feature plugins cannot yet be treated as a
  verified drop-in migration over this engine.
- Resource resolution is a temporary snapshot, not a live vault index; file
  refresh, metadata, root-marker discovery and the worker are Phase 5 work.
- The source's native suite, public API, complete plugin configuration/toggling,
  Obsidian observations, packaging notices and performance budgets remain in
  their later phases. No `verify` binding has been added.

Stopping reason: the remaining core migration and regression adapters were not
completed in this run, so Phase 3 cannot be accepted. The passing focused tests
and native smoke do not substitute for its missing acceptance coverage. Later
feature phases depend on the unfinished engine integration; they were not
started. Next: finish Phase 3's source interaction ports and fuzz harnesses,
retain their original operation counts, run the ordered checks, then proceed
to Phase 4. This record is not a claim of an external/environmental blocker.

### Phase 3 (completed) — Core plugins, 2026-10-07

Delivered: core code/HTML/rule block rendering through the registry and shared
render service; widget-owned async render-pass disposal; renderer precedence
for feature overrides; structural arrow motion and EOF-safe Escape; editor
clipboard service over validated host RPC; persistence on mode reconfiguration.
Added unit coverage for registry add/remove, kernel disposal, Source switching,
reveal boundaries, block motion, clipboard RPC, version-checked view capture,
independent panels, fold replacement and clamped selection/scroll restoration.
Added a disposable core vault fixture and docs/MANUAL_TEST_PLAN.md. Included the
owner's AGENTS.md, DESIGN.md and implementation/testing-policy edits unchanged.

Checks: `pnpm check` (144 unit tests passed), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1, packaged extension in isolated /tmp profile).
Logs: docs/checks/phase3-completed-{check,browser,native}.txt.
Ledger: 83/8/2/340/15 (ported/rewritten/changed/retired/todo), total 448.
All 340 browser/native rows, including previously ported smoke scenarios and
fuzzers, are retired with the owner's policy reason. Existing smoke tests
remain unchanged; remaining unit rows belong to later feature work.

Deviations from DESIGN.md: clipboard is exposed on the editor service; focused
property routing and HTML conversion remain owned by their Phase 4 plugins.
At EOF Escape uses the preceding line; a block occupying the whole document
has no outside position and the command falls through. Feature renderer
registrations take precedence over basic core renderers. No Obsidian observation
or fuzz-count claim is made. Temporary per-panel vault snapshots remain until
Phase 5, as recorded previously.
Known issues: owner manual acceptance is not run. Advanced block widgets,
rename orchestration, properties clipboard and folding controls require their
Phase 4 plugins; core transfer primitives and generic rendering are ready.

### Phase 4 — Feature plugins (incomplete), 2026-10-07

**Incomplete — acceptance criteria not met; Phases 5–8 have not started.**

Delivered: folding (heading/indent config, commands, fold service), lineNumbers,
indentGuides, spellcheck, autoPair (independent brackets/Markdown options),
smartLists, setting-backed Vim and formatting commands. Each has a manifest and
README. Added generated resource-scoped feature/config settings and keybindings,
serialized webview feature reconciliation, host configuration notifications,
active-panel context keys, and owned host command registration/removal. Feature
off/on tests exercise each implemented plugin's compartments and commands.
Added pure editing, folding, indentation, pair configuration, settings queue and
host routing tests, including switching between two panels. Ported the source's
remaining clear-inline-formatting unit test unchanged. Fixed malformed fold
range validation, persistent folded ranges and spellcheck precedence.

Checks (in order): `pnpm check` (161 unit tests passed),
`pnpm test:browser` (14/14), `pnpm test:vscode` (1/1, freshly packaged VSIX,
VS Code 1.140.0, isolated /tmp profile, extensions and home).
Logs: docs/checks/phase4-incomplete-{check,browser,native}.txt.
The browser fake-host handshake was updated for feature settings; no smoke
scenario was added or weakened. Source repositories were read only.
Ledger: 84/8/2/340/14 (ported/rewritten/changed/retired/todo), total 448.
The 14 remaining rows are unit cases, not browser/native/fuzzer scenarios.
Manual test plan now includes each delivered feature's setup, steps, expected
result, settings, commands and off/on behavior. Those manual scenarios are not run.

Deviations from DESIGN.md:
- The current preset is selected at editor creation; changing the preset needs
  reopening the editor. Individual feature enablement/config changes are live.
- The codemirror-vim library exposes no public removal API for ex definitions.
  Their callbacks become inert when the fiber stops and are replaced on the
  next enable. Its undo/redo/save hooks are restored on disposal. This limit is
  documented in the Vim README; no workspaceState setting is used.
- The editor retains the fold state field so persisted ranges can restore
  before feature loading. The folding plugin owns controls and clears folds
  when disposed.

Known issues and missing acceptance work:
- Phase 4 steps 3–10 remain undelivered: links; codeBlocks/math/diagrams/
  callouts/footnotes/tasks; embeds/pagePreview; structured properties; interactive
  tables; inlineTitle; tags/suggest/search; pasteHtml/copyForAgent/markers.
  Core fences still use the generic Phase 3 renderer, not a feature code editor.
- Source table/controller.ts still needs its required split and service-based
  cell-edit projection. Source property sheets still depend on ContentContext
  callbacks for drafts, clipboard and types. These are runtime behaviors, not
  satisfied by the already-ported pure table/property tests. The adapters and
  rich-widget lifecycle work were not completed in this porting pass; copying
  the modules as-is would violate plugin boundaries and document authority.
- Vim cell mode transfer depends on that table work. Source focus-intent and
  title response unit assertions await inlineTitle/properties protocols. Search
  worker/cancellation and WebM unit cases also remain outstanding.
- The live vault index is still the Phase 3 snapshot stub. Plugin management UI,
  complete command/setting parity, public API and release documentation remain
  in later phases. No live Obsidian parity observation is claimed.

Stopping reason: the Phase 4 acceptance gate is not met by this tested subset.
The missing feature adapters are implementation work, not an external tool or
permission blocker. Later phases depend on them (in particular index-backed
links/suggestions/search, complete contributions, markers and public API), so
this run stops here rather than beginning those dependent phases or claiming
Phase 4 complete. Next implementation step: links (Phase 4 step 3), followed by
the remaining ordered feature ports and their unit/manual coverage. Phase 9
was not started. No push, publication or owner-profile installation occurred.

### Phase 4 progress — Links, 2026-10-07

Delivered: links plugin with wikilink decoration, click rules, insertion/follow/
side commands, fragment navigation, validated host RPC and native navigation
adapter. Native opens and note creation enforce vault and symlink containment.
Other application schemes ask before opening; script/data/command/file schemes
are refused. Host and webview feature registrations follow resource enablement.
Corrected six source ledger rows still exercised by the existing smoke suite.
Checks: `pnpm check` (165 unit tests passed), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1, isolated packaged profile). Logs:
`docs/checks/phase4-links-{check,browser,native}.txt`.
Ledger: 84/14/2/334/14 (ported/rewritten/changed/retired/todo).
Deviations from DESIGN.md: native navigation is a workbench adapter; plugin
policy stays in links. Dangerous executable schemes are refused outright.
Known issues: Phase 4 steps 4–10 remain, followed by Phases 5–8. Index-backed
unresolved styling, fresh resolution and new-link-format consumers remain
Phase 5 work. Manual acceptance has not run. No phase-completion claim.

### Phase 4 progress — Code Blocks, 2026-10-07

Delivered: codeBlocks plugin, lazy Prism grammars, editable-fence highlighting,
rendered copy and highlighted-click source mapping. Shared Markdown widget helper
and renderer-identity-aware reuse keep plugin replacement correct. Pass cleanup
removes buttons, highlighting and async work. Added offset and toggle unit coverage.
Checks: `pnpm check` (167 unit tests passed), `pnpm test:browser` (14/14).
Native smoke not rerun: no native wiring changed since the links 1/1 result.
Logs: `docs/checks/phase4-codeblocks-{check,browser}.txt`.
Ledger: 84/14/2/334/14; source code-block scenarios remain retired and are covered
by the new manual section.
Deviations: browser smoke setup now uses the production Prism build plugin and
loads the production entry over its existing fixture server so split ESM chunks
resolve. Test count and assertions are unchanged. No source suite was added.
Known issues: Phase 4 step 4 still needs math, diagrams, callouts, footnotes and
tasks; steps 5–10 and Phases 5–8 remain. Owner manual acceptance is not run.

### Phase 4 progress — Math, 2026-10-07

Delivered: lazy MathJax inline/display rendering, graphics sanitization,
reveal-on-caret widgets, inline/block math commands and owned render cleanup.
Checks: `pnpm check` (169 unit tests passed), `pnpm test:browser` (14/14).
Native not rerun: no native wiring change. Logs: `docs/checks/phase4-math-*`.
Ledger: 84/14/2/334/14. Manual math scenarios added, not run.
Deviations: none. Known issues: diagrams, callouts, footnotes and tasks remain in
step 4, then Phase 4 steps 5–10 and Phases 5–8. No phase-completion claim.

### Phase 4 progress — Diagrams, 2026-10-07

Delivered: lazy strict Mermaid rendering, sanitized SVG, language-specific
renderer, serial render queue and cancellation/restoration on disposal.
Checks: `pnpm check` (171 unit tests passed), `pnpm test:browser` (14/14).
Native not rerun: no native wiring change. Logs: `docs/checks/phase4-diagrams-*`.
Ledger: 84/14/2/334/14. Manual diagrams section added, not run.
Deviations: random SVG ID prefixes use getRandomValues (available in the HTTP
smoke harness as well as the native webview), rather than secure-context-only
randomUUID. Known issues: callouts, footnotes and tasks remain in step 4, then
Phase 4 steps 5–10 and Phases 5–8. No phase-completion claim.

### Phase 4 progress — Callouts, 2026-10-07

Delivered: callout rendering, nested/foldable disclosure memory per panel,
presentation persistence, insertion command, owned styles and listener cleanup.
Checks: `pnpm check` (173 unit tests passed), `pnpm test:browser` (14/14).
Native not rerun: no native wiring change. Logs: `docs/checks/phase4-callouts-*`.
Ledger: 84/14/2/334/14. Manual callout scenarios added, not run.
Deviations: none. Known issues: footnotes and tasks remain in step 4, then
Phase 4 steps 5–10 and Phases 5–8. No phase-completion claim.

### Phase 4 progress — Footnotes, 2026-10-07

Delivered: named/inline reference widgets, hover/focus previews, definition
navigation, multiline definition rendering, insertion and render pre-processing
for references inside other blocks. Added explicit renderer ranges and render
revision invalidation so changing definitions or feature enablement refreshes
retained rendered blocks. Random placeholder IDs avoid source markup collisions.
Checks: `pnpm check` (176 unit tests passed), `pnpm test:browser` (14/14).
Native not rerun: no native wiring change. Logs: `docs/checks/phase4-footnotes-*`.
Ledger: 84/14/2/334/14. Manual footnote scenarios include the source's split-view
undo case; no manual acceptance result is claimed.
Deviations: render/preProcess and render/changed are typed lifecycle hooks for
cross-block references. Definition changes invalidate rendered blocks; performance
measurement remains Phase 9. Known issues: tasks remains in step 4, then Phase 4
steps 5–10 and Phases 5–8. Embedded-note footnote context needs integration with
embeds in step 5. No phase-completion claim.

### Phase 4 progress — Tasks, 2026-10-07

Delivered: inline/rendered task checkboxes, checklist commands, exact expected-line
checks and contained native edits for authorized embedded-note sources. Host and
webview handlers stop/restart with the feature. Added command, stale-line,
source-authorization and RPC-lifecycle unit coverage.
Checks: `pnpm check` (181 unit tests passed), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1, packaged isolated profile). Logs:
`docs/checks/phase4-tasks-{check,browser,native}.txt`.
Ledger: 84/14/2/334/14. Manual task scenarios added; verify keys remain unbound.
Deviations: Resources exposes a host authorization operation for previously
loaded note identities; render context carries an optional embedded document URI.
Known issues: Phase 4 steps 5–10 remain (embeds/pagePreview, properties, tables,
inlineTitle, tags/suggest/search, pasteHtml/copyForAgent/markers), then Phases
5–8. Embedded task UI and footnote source context need step 5 integration.
No owner manual acceptance or phase-completion claim.

### Phase 4 progress — Embeds, 2026-10-07

Delivered: note/heading/block transclusion, circular/depth checks, image inspector,
audio/video with pinned-source WebM recovery, attachment cards and embed insertion.
Embedded render contexts retain source URI/text/line offsets for links, tasks and
footnotes; host source identity is re-authorized before navigation or edits. Native
workspace trust now controls remote rendering. Resource reads see unsaved native
text. Ported both remaining WebM unit tests and fixtures. Formatted this run's
TypeScript into readable statements and kept production modules below 400 lines.
Checks: `pnpm check` (185 unit tests passed), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1, isolated packaged profile). Logs:
`docs/checks/phase4-embeds-{check,browser,native}.txt`.
Ledger: 86/15/2/333/12. Corrected the retained native typing/save/undo row to
rewritten; historical records retain their original counts.
Deviations: links navigation additionally accepts a schema-checked source offset
for embedded footnote definitions. Media/graphics remain lazy and pass-owned.
Known issues: pagePreview and Phase 4 steps 6–10 remain, followed by Phases 5–8.
Live resource/index invalidation remains Phase 5. Owner manual acceptance is not
run; no phase-completion claim.

### Phase 4 progress — Page Preview, 2026-10-07

Delivered: source-compatible modifier-hover and Alt+Enter previews, keyboard
focus/escape behavior, read-only task previews, attachment rendering, late-reply
generation checks and lifecycle cleanup. Internal previews preserve the originating
note and distinguish Markdown links from wikilinks when opened.
Checks: `pnpm check` (187 unit tests passed), `pnpm test:browser` (14/14).
Native not rerun: no native wiring change since embeds' 1/1 check. Logs:
`docs/checks/phase4-pagepreview-{check,browser}.txt`.
Ledger: 86/15/2/333/12. Manual preview scenarios added, not run.
Deviations: popup is attached to its editor DOM so plugin-owned theme and link
handlers apply; it still uses fixed viewport positioning.
Known issues: Phase 4 steps 6–10 remain: full structured properties, split table
controller/cell projection, inlineTitle rename/view transfer, tags/suggest/search,
pasteHtml/copyForAgent/markers. Then Phase 5 index/host features, Phase 6 command/
settings/parity inventory, Phase 7 public API and Phase 8 packaging/handover remain.
No phase-completion claim; owner manual acceptance is not run.

### Phase 4 (incomplete) — Feature plugins continuation, 2026-10-07

Delivered in this run: links, codeBlocks, math, diagrams, callouts, footnotes,
tasks, embeds and pagePreview, each committed with unit coverage, README and
manual scenarios. Added direct, disposable editor-DOM link listeners so widgets
cannot bypass link handling via CodeMirror's ignoreEvent filter. Added definition
back-reference controls for repeated footnotes. Kernel toggle checks now verify
render pre/post-processors and fence claims as well as compartments and commands.
Seven retained smoke ledger rows are correctly rewritten rather than retired.

Final checks, in order: `pnpm check` (187 unit tests passed; lint, all TypeScript
projects and contribution generation passed), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1, latest packaged extension in its isolated /tmp profile).
Logs: `docs/checks/phase4-continuation-{check,browser,native}.txt`.
Ledger: 86/15/2/333/12 (ported/rewritten/changed/retired/todo), total 448.

Deviations from DESIGN.md: typed render/preProcess and render/changed hooks
support cross-block footnotes and feature refresh; links accepts a validated
source offset for embedded footnote navigation. The existing browser smoke build
uses the production Prism plugin and loads split modules over its fixture server.
Script/data/command/file application schemes are refused rather than confirmed.
All recommended section 25 defaults remain adopted; verify keys remain unbound.

Known issues / exact remaining work:
- Phase 4: structured properties (draft reconciliation, scalar/list/chip editing,
  row sorting/dragging, structured clipboard, type preferences keyed by vault,
  heading focus and save-time draft commit); tables (split controller, cell edit
  projection, selection, navigation, menus, drag/scroll, clipboard and Vim cell
  transfer); inlineTitle (rename, focus intent and independent panel view transfer);
  tags/suggest/search (channels, sources, worker/cancellation); pasteHtml,
  copyForAgent and markers. Each still needs its full lifecycle unit coverage,
  README, contributions and manual scenarios.
- Phase 5: replace the per-panel snapshot vault with shared per-vault indexes,
  nearest-marker roots, worker parsing, persistence, open-document overlays,
  exclusions and incremental link resolution; migrate resource/suggestion/tag/
  search consumers; unresolved styling; outline/symbols, backlinks/unlinked
  mentions, outgoing links, tags view, linkUpdates, quickSwitcher and wordCount;
  the 10,000-note measurement and its record.
- Phase 6: finish command/setting routing and defaults, plugin management and
  workspace editor association command; comprehensive manual inventory and
  PARITY.md with unobserved rows. Keep verify bindings unbound.
- Phase 7: frozen public API/declarations, isolated external plugin contexts,
  selection snapshots and errors, marker mapping, external actions/processors,
  complete facade unit tests and API.md.
- Phase 8: final packaging/notices and allowlist audit, README/CAPABILITIES/
  CHANGELOG, sample external plugin, complete manual handover, zero todo ledger
  rows and ordered release checks. Native smoke packaging during this run does
  not establish Phase 8 completion.
- Manual acceptance has not run. Fresh resource/index invalidation is still
  absent. The latest completed feature is pagePreview; the next implementation
  unit is structured properties. Its pinned source was inspected but not ported.

This is an incomplete checkpoint, not a phase-completion record. No external
permission/tool/resource blocker was found; this run did not finish the requested
through-Phase-8 scope. No push, publication, owner-profile installation or source
repository modification occurred.

### Phase 4 progress — Properties sheet, 2026-10-08

Delivered: structured scalar/list/chip editing, focused draft reconciliation,
row selection and structured clipboard, sorting/drag ordering, type preferences,
heading paging and Add File Property. Split sheet/form controls under 400 lines.
Added strict pre-flush draft participants to the document service; invalid drafts
reject save. Host preferences and webview registrations dispose with the plugin.
Checks: `pnpm check` (193 unit tests passed), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1, packaged isolated /tmp profile). Logs:
`docs/checks/phase4-properties-{check,browser,native}.txt`.
Ledger: 87/15/2/333/11 (ported/rewritten/changed/retired/todo).
Deviations: property controls use a plugin-local sheet adapter over injected
services; strict document flush participants propagate draft errors rather than
using error-isolating events. Type preferences use the vault service root, whose
nested-marker discovery remains Phase 5. Heading-to-title focus is a typed event
for the upcoming inlineTitle plugin.
Known issues: tables, inlineTitle, tags/suggest/search, pasteHtml/copyForAgent/
markers remain in Phase 4, followed by Phases 5–8 as itemized in the preceding
incomplete record. Nested-root preference isolation and title-focus integration
are pending those owning units. Owner manual acceptance has not run.

### Phase 4 progress — Tables, 2026-10-08

Delivered: split table controller, projected cell editing, rectangular selection,
clipboard, boundary navigation, row/column menus, sorting, handles and edge scroll;
15 table operations and insertion contributed to the palette. Formatting and Vim
cell transfer use injected services. Selection capture maps cell ranges into the
outer document. Fixed source-disclosure mapping on prefix insertion, stale widget
reuse after plugin restart, and cancelled rendering overwriting cell editors.
Also corrected property-type broadcasts between independently owned panel contexts
using disposable shared-store subscriptions and tested strict draft flush errors.
Checks: `pnpm check` (199 unit tests passed), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1, packaged isolated profile). Logs:
`docs/checks/phase4-tables-{check,browser,native}.txt`.
Ledger: 87/15/2/333/11. Source table browser/native scenarios remain retired;
manual table scenarios added, including the drag/scroll regression.
Deviations: controller operations are split by responsibility into functions with
an explicitly typed controller receiver; all modules remain below 400 lines.
The editor exposes typed active-view/projected-selection hooks; document input
markers and grouping, basic inline presentation, formatting and Vim transfer use
public plugin contracts. Render requests accept cancellation before DOM writes.
Known issues: inlineTitle, tags/suggest/search, pasteHtml/copyForAgent/markers,
then Phases 5–8 remain. Nested vault discovery and the full host index remain
Phase 5. Cell HTML-paste conversion awaits pasteHtml. Owner manual acceptance,
including table drag and nested cell presentation, has not run.

### Phase 4 (composition fixes) — 2026-10-08

Delivered (kernel unit): caller-bound service reads through the exported
`bindCaller` symbol, cached per consumer context and provider identity; injected
rank ordering for event listeners, with prepend as a slot and stable per-owner
registration order. Included the owner's uncommitted DESIGN.md changes.
Violation fixed: event listener priority previously depended on activation
history; ordering now uses rank and owner ID, including after update/restart.
Checks: `pnpm check` (201 unit tests passed). Smoke suites deferred until the
last composition commit, as requested. Log: `docs/checks/composition-kernel.txt`.
Ledger: 87/15/2/333/11 (ported/rewritten/changed/retired/todo).
Deviations from DESIGN.md: tied ranks sort by owner ID, allowing all external
plugins to share the rank after built-ins while remaining deterministic.
Known issues: composition still needs bootstrap catalog ranks, ordered editor
registry and caller forwarding, editor settings, view-state contributions,
folding ownership/reconfiguration/cache fix, controller updates, catalog-wide
composition tests and plugin audit/manual scenarios. Then Phase 4 inlineTitle,
tags/suggest/search, pasteHtml/copyForAgent/markers and Phases 5–8 remain.

Composition registry unit, 2026-10-08: replaced append-only compartments with
one sorted registry; caller-bound editor and Live Preview registrations preserve
consumer ownership. Host, panel and webview roots receive the same catalog rank.
Line numbers precede folding; tables precede Vim in the override slot. Included
the owner's additional first-ranked renderer rule: block selection now takes the
first match, with generic core renderers explicitly in the base fallback slot.
Violations fixed: activation-history extension priority, delegated renderers
losing their owner, and reversed renderer precedence. Registry tests preserve
unrelated state-field identity; the feature fixture uses the real registry and
asserts ordered owners after every feature toggle and a seeded toggle sequence.
Checks: `pnpm check` (204/204); smoke suites still deferred to final composition
commit. Log: `docs/checks/composition-registry.txt`. Ledger unchanged.
Known issues: editor settings, feature-owned view state, folding reconfigure/cache,
controller update, remaining composition audit and config-change tests still
come first; remaining Phase 4 plugins and Phases 5–8 are unchanged above.

Composition state unit, 2026-10-08: reviewed and retained the interrupted working
changes. Editor owns validated `editor.useTabs`/`editor.tabSize`, propagated by
host RPC and applied through `fiber.update`/`reconfigure` without replacing the
view. The feature controller updates existing fibers. Generic schema-validated
view-state contributions retain unknown/inactive keys and restore late arrivals.
Folding now owns its field, commands, ranges and persistence; its private
configuration compartment preserves folds. Heading queries use the immutable
Text metadata cache instead of allocating a string-keyed parse for each query.
Callouts own disclosure memory, remap renamed/nested source identities and update
live disclosures on restore. Moved the existing view-transfer tests without
removing their assertions and added state, settings and cache regressions.
Violations fixed: editor-wide indentation was implicit rather than configured;
core owned feature state; settings recreated feature fibers; core-setting RPC
bypassed fiber update; folding reparsed metadata and lost state on reconfiguration;
callout restore did not update live disclosures.
Checks: `pnpm check` (211/211; lint, typecheck and generated contributions passed).
Log: `docs/checks/composition-state.txt`. Smoke suites deferred to the final
composition commit. Ledger unchanged: 87/15/2/333/11, total 448.
Deviation: legacy top-level `folded`/`folds` wire fields remain validated read-only
compatibility inputs; new captures store data in generic contributions.
Known issues: finish catalog-wide behavioral composition checks, audit every
plugin and document manual scenarios; then the previously listed remaining
Phase 4 plugins and Phases 5–8. Manual acceptance remains unrun.

**Composition fixes complete — 2026-10-08.** This closes every composition item
in the preceding Known issues; it does not mark Phase 4 complete. The preserved
work was reviewed before extension and committed in the state unit above. The
final unit audits all 27 implemented plugins and adds owner manual scenarios.
Full per-plugin evidence and scope: [composition audit](docs/COMPOSITION_AUDIT.md).

Violations found and fixes (including the earlier composition commits):
- Activation-history event priority → prepend slots plus shared catalog ranks,
  stable owner/per-owner order and caller-bound service reads.
- Append-order editor compartments → one sorted extension registry; stable
  line-number/folding gutters and table-before-Vim overrides.
- Delegated renderer ownership lost → caller forwarding through Live Preview.
- Last matching renderer won → first-ranked match and explicit core fallback slot.
- Missing core indentation settings → validated editor.useTabs/editor.tabSize,
  resource-scoped host propagation and in-place editor reconfiguration.
- Core owned feature view state → generic validated contributions; folding owns
  ranges/field and callouts owns disclosures, with late restore and unknown keys.
- Settings disposed/recreated fibers → fiber.update; editor, folding and autoPair
  use compartments, properties retains its editing service while replacing its
  renderer, links retains its listeners and initial-navigation lifetime.
- Folding lost ranges/reparsed metadata → preserve fold state while reconfiguring
  the service; query cached metadata using immutable Text identity.
- Fold gutter stayed stale after config/tab-width changes → explicit foldingChanged
  predicate, preserving current ranges while refreshing available markers.
- Callout restore left mounted disclosures stale and missed nested rename identity
  → owned live bindings and local/nested prefix remapping.
- Catalog tests checked owners alone → compare keymaps, renderer order/winners,
  content attributes, pair data and fold behavior with fresh starts; exercise
  every feature, config changes and seeded toggles; assert state retention and
  guard all production feature modules against editor singleton settings.

Final checks, in required order: `pnpm check` **215/215 unit tests**, lint, all
TypeScript projects and contribution generation passed; `pnpm test:browser`
**14/14**; `pnpm test:vscode` **1/1**, freshly packaged in its isolated `/tmp`
profile. Logs: `docs/checks/composition-audit-{check,browser,native}.txt`.
No smoke assertions were removed or suites expanded. Ledger remains **87 ported,
15 rewritten, 2 changed, 333 retired, 11 todo; total 448**. The pinned inventory
contains 446 source scenarios plus two additional ledger rows. Manual scenarios
are documented, **not run**; smoke success is not owner acceptance.

Deviations: equal catalog ranks use owner ID as a deterministic tie break;
legacy top-level folded/folds protocol data remains a validated compatibility
input while new captures use generic contributions. Existing Vim Ex callbacks
are deactivated on disposal because the dependency lacks a removeEx API; this
pre-existing limitation is recorded in the audit. No other design deviation.

Known issues / remaining work (outside this run):
- Phase 4: inlineTitle (rename, focus intent and independent panel view transfer),
  tags, suggest, search (sources/channels/worker/cancellation), pasteHtml,
  copyForAgent and markers, with their lifecycle coverage, contributions, README
  and manual scenarios. HTML paste into table cells and rename UI acceptance
  await their owning units. None was started in this run.
- Phase 5: shared live per-vault indexing, nearest-marker roots, workers,
  persistence/overlays/exclusions/incremental resolution, consumer migration,
  host views/link updates/quick switcher/word count and 10,000-note measurement.
- Phase 6: command/settings parity, plugin management, editor association,
  manual inventory and PARITY.md; verify bindings remain unbound.
- Phase 7: frozen API/declarations, external contexts, selection/error facade,
  markers/actions/processors, facade tests and API.md.
- Phase 8: packaging/notices/allowlist, release documentation, sample external
  plugin, complete handover, zero todo ledger rows and ordered release checks.
- Owner manual acceptance remains unrun, including split-panel recovery,
  gutter/widget appearance, property drafts and table/Vim focus. The current
  vault remains the Phase 3 snapshot stub; nested-root preference isolation
  and fresh index/resource invalidation remain later-phase work.

Stop after the composition audit commit, with a clean tree for the owner's
code-quality tooling. No push, publication, owner-profile installation or change
to human-learning, its worktrees or vscode-embedPDF occurred.

### Readability pass progress — Tables, 2026-10-08

Delivered: committed the owner's tooling baseline unchanged (`21ac0e6`), then
replaced the tables controller's imported `this:` fields with collaborators:
`grid.ts` owns rendering/source snapshots, `projection.ts` owns the cell editor,
`selection.ts` owns grid selection, `keyboard.ts` routes boundary movement,
`clipboard.ts` owns clipboard/formatting, and `toolbar.ts` owns menus. The
controller wires callbacks and reconciles snapshots. Rewrote the long cell editor,
handle/selection gesture registrations and menu construction; table `apply` now
lists named registrations and render-pass lifetime lives in `content.ts`.
Rewrote the tables README and added the manual regression section.

Backlog before → after (file counts per rule): max-lines-per-function 66 → 58;
complexity 33 → 29; max-params 13 → 12; no-nested-ternary 19 → 18; max-depth
1 → 1; no-restricted-syntax 6 → 0. Distinct backlog files: 86 → 73. All 13
table files formerly listed are removed; no rule limit or exemption was added.
Added five pure-logic unit tests; count 215 → 220. No behavior bug was found
or intentionally fixed in this rewrite. Native wiring is unchanged.

Checks: `pnpm check` 220/220, formatting/lint/typecheck/contributions passed;
`pnpm test:browser` 14/14. Native smoke not rerun for this unit: no native
wiring change. Logs: `docs/checks/readability-tables-{check,browser}.txt`.
Baseline was independently checked: 215/215 unit, 14/14 browser smoke.
Ledger unchanged: 87 ported / 15 rewritten / 2 changed / 333 retired / 11 todo,
total 448. Manual scenarios documented, not run.
Deviations: none; no new inline lint disables.

Known issues / exact remaining work:
- Readability first: properties controls/chips/lists and the rest of its backlog;
  pagePreview/controller; host/workbench, editor and footnotes registrations;
  markdown/search/evaluate and metadata/footnote-extract; all remaining entries
  in eslint.legacy.mjs. Rewrite remaining plugin READMEs, add kernel generation/
  Context-proxy why-comments, extend manual regression inventory per rewritten
  plugin, then delete the empty backlog/config block and run ordered completion
  checks with the dated completion record. This table unit is not completion
  of the readability pass.
- Then Phase 4 inlineTitle, tags, suggest, search, pasteHtml, copyForAgent and
  markers, each with lifecycle/composition units, contributions, README and
  manual scenarios. Phases 5–8 remain as specified above: live shared vault
  index and host features, command/settings parity, public API, packaging/docs
  and complete handover. No new feature or phase completion is claimed here.
- Owner acceptance remains unrun; prioritize the table drag/scroll, cell
  projection and two-panel/Vim scenarios in the manual regression section.

### Readability pass progress — Property chips and lists, 2026-10-08

Delivered: chip draft commit/cancel/focus recovery is owned by `chip-draft.ts`;
chip focus/menu/clipboard registrations stay in `chips.ts` with an options object
and narrow `chip-actions.ts` contract. List reconciliation, latest-value writes
and pending-entry removal live in `lists.ts`; input events and scalar normalization
are separate responsibilities in `list-input.ts` and `list-values.ts`.
`chip-values.ts` retains duplicate-occurrence matching. Rewrote the Properties
README to the prescribed template; its earlier nested-vault status remains in
Phase 4/Phase 5 records. Added owner regression scenarios; not run.

Backlog since preceding unit → now: max-lines-per-function 58 → 56; complexity
29 → 28; max-params 12 → 11; no-nested-ternary 18 → 17; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 73 → 71. Removed chips/lists entries;
no added exemptions, inline disables, weakened tests or intentional behavior
changes. Added two scalar/occurrence units: count 220 → 222.
Checks: `pnpm check` 222/222, formatting/lint/types/contributions passed;
`pnpm test:browser` 14/14. Native not run: no native wiring changes.
Logs: `docs/checks/readability-property-lists-{check,browser}.txt`.
Ledger unchanged: 87 ported / 15 rewritten / 2 changed / 333 retired / 11 todo.
Deviations: none. No newly discovered behavior bug.

Known issues / exact remaining work: readability remains incomplete. Next are
properties controls, then editing/fields/form/order/selection/sheet-html/sheet/
webview; pagePreview/controller; host/workbench, editor and footnotes apply;
markdown/search/evaluate and metadata/footnote-extract; every other entry still
listed in eslint.legacy.mjs. Finish remaining READMEs, kernel why-comments and
manual regression inventory, remove the exhausted backlog and run completion
smokes. Then deliver remaining Phase 4 plugins and Phases 5–8 as specified in
the preceding record. No new plugin or phase was completed by this unit.

### Readability pass progress — Property controls, 2026-10-08

Delivered: replaced the monolithic structural-control binder with named panel,
row and order registrations. `control-edits.ts` owns commit guards/focus recovery;
`row-name.ts` owns rename validation/type retention; `row-menu.ts` owns type and
selection menus; `row-navigation.ts` maps keys to row actions. Retained panel/
row bindings and existing selection/order lifetimes preserve reconciliation.
Added pure units for post-removal focus and key priority; README/manual inventory
updated. No intentional behavior changes or newly discovered bug.

Backlog since preceding unit → now: max-lines-per-function 56 → 55; complexity
28 → 27; max-params 11 → 11; no-nested-ternary 17 → 16; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 71 → 70. No new lint disables or
exceptions. Unit count 222 → 224.
Checks: `pnpm check` 224/224 and `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-property-controls-{check,browser}.txt`.
Ledger unchanged: 87 ported / 15 rewritten / 2 changed / 333 retired / 11 todo.
Deviations: none. Manual acceptance has not run.

Known issues / exact remaining work: properties editing/fields/form/order/
selection/sheet-html/sheet/webview; then pagePreview/controller, host/workbench,
editor and footnotes registration functions, markdown/search/evaluate and
metadata/footnote-extract, and all other remaining eslint.legacy.mjs entries.
Complete remaining README rewrites, kernel why-comments and manual regression
inventory before the readability completion record and ordered checks. Remaining
Phase 4 plugins and Phases 5–8 are unchanged from the Tables progress record.

### Readability pass progress — Property scalar editing, 2026-10-08

Delivered: scalar drafts have a `PropertyField` owner with named begin/commit/
cancel/event operations; checkbox registration remains in `fields.ts`.
`PropertyEditing` takes named options instead of nine positional parameters.
Extracted pure edit/order composition to `edit-transaction.ts` and separated
conversion confirmation from its stale-source check and application. Added tests
for rename/removal ordering, explicit order, no-op/stale edits and conversion
value policy. Existing unit assertions were preserved. README/manual updated.

Backlog since preceding unit → now: max-lines-per-function 55 → 53; complexity
27 → 26; max-params 11 → 10; no-nested-ternary 16 → 16; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 70 → 68. No exemptions or inline
disables added. Unit count 224 → 227.
Checks: `pnpm check` 227/227; `pnpm test:browser` 14/14. Native not run because
native wiring is unchanged. Logs: `docs/checks/readability-property-editing-{check,browser}.txt`.
Ledger unchanged: 87 ported / 15 rewritten / 2 changed / 333 retired / 11 todo.
Deviations: none. No intentional behavior changes or new bug fixes.

Known issues / exact remaining work: properties form/order/selection/sheet-html/
sheet/webview; then pagePreview/controller, host/workbench, editor and footnotes
registrations, markdown/search/evaluate and metadata/footnote-extract, and all
other remaining eslint.legacy.mjs entries. Finish remaining READMEs, kernel
why-comments, manual regression inventory and readability completion checks.
Remaining Phase 4 plugins and Phases 5–8 remain as previously recorded. Owner
manual acceptance has not run; no phase completion is claimed.

### Readability pass progress — Properties complete, 2026-10-08

Delivered: finished the Properties backlog. Form heading navigation and creation
are separate operations; selection has named pointer/clipboard/keyboard handlers;
ordering separates gesture creation, movement, drop and cancellation. Sheet
reconciliation separates row reuse from deferred focus restoration. HTML rendering
has named row, scalar, list, checkbox and nested-value renderers. `apply` lists
registrations, with renderer reconfiguration owned by `PropertyPresentation`.
README lists every file and actual injected services/events; manual regression
inventory now covers all rewritten property interactions.

Backlog since preceding unit → now: max-lines-per-function 53 → 47; complexity
26 → 22; max-params 10 → 9; no-nested-ternary 16 → 14; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct backlog files 68 → 62. All Properties files
are removed; no new exceptions/inline disables. Three rendering units raise the
count 227 → 230. No intentional behavior changes or separately discovered bugs.
Checks: `pnpm check` 230/230 and `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-properties-final-{check,browser}.txt`.
Ledger unchanged: 87 ported / 15 rewritten / 2 changed / 333 retired / 11 todo.
Deviations: none. Owner manual acceptance remains unrun.

Known issues / exact remaining work: pagePreview/controller; host/workbench,
editor and footnotes registrations; markdown/search/evaluate and metadata/
footnote-extract; every other remaining eslint.legacy.mjs entry. Complete all
remaining plugin README rewrites and kernel why-comments; extend the manual
regression inventory and finish ordered readability checks/record. Then finish
Phase 4 inlineTitle/tags/suggest/search/pasteHtml/copyForAgent/markers and Phases
5–8 exactly as specified above. Only the Tables and Properties portions of the
readability backlog are complete; this is not overall readability completion.

### Readability pass progress — Page Preview, 2026-10-08

Delivered: page-preview controller now separates hover, keyboard and focus
registrations from popup loading; DOM/placement lives in `popup.ts` and note/
attachment rendering in `content.ts`. Generation ownership and read-only task
contexts are retained. Popup state is installed before keyboard focus moves,
preserving focus-event ordering. Plugin apply lists theme/controller registrations.
README rewritten; owner regression scenarios added. No intentional behavior change.

Backlog since preceding unit → now: max-lines-per-function 47 → 46; complexity
22 → 21; max-params 9 → 9; no-nested-ternary 14 → 14; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 62 → 61. No inline disables or new
exemptions. Added note-context and label units: 230 → 232.
Checks: `pnpm check` 232/232 and `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-preview-{check,browser}.txt`.
Ledger unchanged: 87 ported / 15 rewritten / 2 changed / 333 retired / 11 todo.
Deviations: none. No newly discovered behavior bug; manual checks remain unrun.

Known issues / exact remaining work: host/workbench, editor and footnotes
registrations; markdown/search/evaluate and metadata/footnote-extract; all other
remaining eslint.legacy.mjs entries. Finish all remaining plugin READMEs,
kernel generation/Context-proxy comments and manual regression inventory, then
remove the backlog and run ordered completion checks. Remaining Phase 4 plugins
and Phases 5–8 are unchanged from the Tables record; no phase is complete here.

### Readability pass progress — Native workbench adapter, 2026-10-08

Delivered: workbench assembly now composes document, command, configuration and
file adapters. `NativeDocuments` owns stable native/wrapper identity and live
getters. Panel creation, transport, active-tab checks and state subscriptions
are named functions; all remain in the native adapter module rather than spreading
VS Code imports through feature plugins. No behavioral or policy change.

Backlog since preceding unit → now: max-lines-per-function 46 → 45; complexity
21 → 21; max-params 9 → 9; no-nested-ternary 14 → 14; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 61 → 60. No exceptions added.
Checks in order: `pnpm check` 232/232; `pnpm test:browser` 14/14;
`pnpm test:vscode` 1/1, freshly packaged in `/tmp/markdown-workbench-e2e-7235d867`.
Logs: `docs/checks/readability-workbench-{check,browser,native}.txt`.
No smoke suite expansion. Ledger unchanged: 87/15/2/333/11, total 448.
Deviations: none. No new pure algorithm or bug fix; unit count unchanged.

Known issues / exact remaining work: editor and footnotes registrations;
markdown/search/evaluate and metadata/footnote-extract; all other remaining
eslint.legacy.mjs entries. Complete other plugin READMEs, kernel why-comments
and manual regression inventory, then remove the backlog and run completion
checks. Remaining Phase 4 plugins and Phases 5–8 remain undelivered as recorded
above. Native smoke success does not imply owner acceptance or Phase 8 completion.

### Readability pass progress — Editor, 2026-10-08

Delivered: host registration separates active contexts and the editor facade;
panel setup takes named lifecycle options and has dedicated channel registrations.
Webview apply lists view/settings/service/selection/persistence/reveal setup.
`service.ts` owns caller-bound registration; `persistence.ts` owns capture/restore
and persistence subscriptions. Scroll anchoring has an instance owner with named
capture/restore/measurement methods. Rewrote the README and manual regression
inventory. Extension owner tie-breaking is named and unit-covered.

Backlog since preceding unit → now: max-lines-per-function 45 → 41; complexity
21 → 21; max-params 9 → 8; no-nested-ternary 14 → 13; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 60 → 55. All Editor entries removed;
no new exemptions or inline disables. Unit count 232 → 233.
Checks, in order: `pnpm check` 233/233; `pnpm test:browser` 14/14;
`pnpm test:vscode` 1/1, fresh VSIX in the isolated /tmp profile.
Logs: `docs/checks/readability-editor-{check,browser,native}.txt`.
Ledger unchanged: 87/15/2/333/11, total 448. No smoke additions.
Deviations: none. No intentional behavior changes or newly discovered source bug.

Known issues / exact remaining work: footnotes registrations; markdown/search/
evaluate and metadata/footnote-extract; every other remaining eslint.legacy.mjs
entry. Rewrite remaining plugin READMEs and add kernel why-comments; finish manual
regression inventory, remove the empty backlog/config block, and run readability
completion checks. Then remaining Phase 4 plugins and Phases 5–8 as recorded
above. Full owner acceptance remains unrun; no phase completion is claimed.

### Readability pass progress — Footnotes plugin, 2026-10-08

Delivered: apply lists definition invalidation, theme, inline/block renderers,
pass processors and insertion registration. `preprocess.ts` resolves placeholders
as pure logic; `RenderedReferences` owns render-pass controls and cleanup;
`ReferenceControl` owns preview DOM, listeners and late-render disposal. Reference
mounting takes named capabilities rather than five positional parameters. README
and manual regression inventory updated. Existing behavior is preserved.

Backlog since preceding unit → now: max-lines-per-function 41 → 39; complexity
21 → 21; max-params 8 → 7; no-nested-ternary 13 → 13; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 55 → 53. No new lint exceptions.
Added two preprocessing units; count 233 → 235.
Checks: `pnpm check` 235/235; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change since Editor's 1/1. Logs:
`docs/checks/readability-footnotes-{check,browser}.txt`.
Ledger unchanged: 87/15/2/333/11, total 448. Deviations: none. No new bug fix.

Known issues / exact remaining work: markdown/search/evaluate and metadata/
footnote-extract next; every other remaining eslint.legacy.mjs entry, remaining
plugin READMEs, kernel why-comments and manual regression coverage; then remove
the empty backlog and run readability completion checks. The rest of Phase 4
and Phases 5–8 remain as above. Owner manual scenarios remain unrun.

### Readability pass progress — Search evaluation, 2026-10-08

Delivered: compiled queries share a `SearchComparison` regex cache; each evaluated
document owns lazy content, tag, property and structural-region caches. Named
methods separate Boolean, property, tag and scoped evaluation. Scalar/null/numeric
comparison and document-kind inference no longer use nested ternaries. Existing
source search assertions remain intact; three units cover typed comparisons,
recursive arrays, regex sensitivity cache isolation and file-kind inference.

Backlog since preceding unit → now: max-lines-per-function 39 → 38; complexity
21 → 20; max-params 7 → 7; no-nested-ternary 13 → 12; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 53 → 52. No new exceptions. Unit
count 235 → 238. Checks: `pnpm check` 238/238; `pnpm test:browser` 14/14.
Native not rerun: pure evaluation rewrite, no native wiring change. Logs:
`docs/checks/readability-search-{check,browser}.txt`.
Ledger unchanged: 87/15/2/333/11. Deviations: none; no behavior bug fixed.
The search plugin is still undelivered; this is its existing pure foundation only.

Known issues / exact remaining work: metadata/footnote-extract, then all other
remaining eslint.legacy.mjs entries; remaining plugin READMEs, kernel comments
and manual regression inventory. Remove the exhausted backlog and run ordered
readability completion checks before remaining Phase 4 and Phases 5–8. Those
phase deliverables are unchanged from the Tables record. Owner acceptance unrun.

### Readability pass progress — Footnote metadata, 2026-10-08

Delivered: extraction now reads definitions, collects reference candidates and
assigns reading-order numbers as separate stages. `footnote-definitions.ts`
owns syntax exclusion and continuation/source segments; `footnote-candidates.ts`
owns tree collection and quote/list-prefix normalization. Candidate collection
receives only definition ranges. Added segment-boundary and unmappable-candidate/
duplicate-definition units; all original footnote assertions remain intact.

Backlog since preceding unit → now: max-lines-per-function 38 → 37; complexity
20 → 19; max-params 7 → 7; no-nested-ternary 12 → 12; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 52 → 51. No added lint exceptions.
Unit count 238 → 240. Checks: `pnpm check` 240/240; `pnpm test:browser` 14/14.
Native not rerun: pure extraction rewrite, no native wiring change. Logs:
`docs/checks/readability-footnote-metadata-{check,browser}.txt`.
Ledger unchanged: 87/15/2/333/11. Deviations: none. No behavior bug fixed.
Manual Footnotes regression scenarios above cover consumers; not run by the agent.

Known issues / exact remaining work: the 51 files still listed in
eslint.legacy.mjs, including the kernel proxy/event/schema backlog, remaining
pure Markdown modules, shared utilities and plugin registrations. Finish all
remaining plugin READMEs and kernel why-comments, manual inventory and ordered
completion checks; delete the empty backlog/config block only once all entries
comply. Remaining Phase 4 plugins and Phases 5–8 remain unchanged and incomplete.

### Readability pass progress — Kernel, 2026-10-08

Delivered: Context proxy delegates declared-service reads and caller binding to
named logic; comments explain the actual consumer receiver, provider-identity
cache and Promise `then` probe. Fiber comments explain generation invalidation
before awaited cleanup. Event registration uses named owner/logger/slot options;
owner tie-breaking and schema bound keywords/measurements are explicit helpers.
Clarified the kernel README's API-boundary responsibility without claiming Phase 7.

Backlog since preceding unit → now: max-lines-per-function 37 → 37; complexity
19 → 18; max-params 7 → 6; no-nested-ternary 12 → 10; max-depth 1 → 1;
no-restricted-syntax 0 → 0. Distinct files 51 → 48. Kernel stays at 878 formatted
production lines, under the unchanged 1,000-line budget. No inline disables added.
Two schema/event units raise count 240 → 242; existing lifecycle/race assertions
remain intact. Checks: `pnpm check` 242/242; `pnpm test:browser` 14/14.
Native not rerun: no native adapter change since Editor's 1/1. Logs:
`docs/checks/readability-kernel-{check,browser}.txt`.
Ledger unchanged: 87/15/2/333/11. Deviations: none. No behavior bug fixed.

Known issues / exact remaining work: the 48 files still in eslint.legacy.mjs;
remaining plugin README rewrites and manual regression inventory; delete the
backlog/config block only after all remaining files comply, then run ordered
readability completion checks and write its final before/after record. The
requested kernel why-comments are now done. Remaining Phase 4 plugins and
Phases 5–8 remain undelivered as specified above; owner manual acceptance unrun.

### Readability pass progress — Markdown HTML rules, 2026-10-08

Delivered: named inline/block math rules, callout transformation/closing-token/
metadata helpers, early-return block-ID attachment, and a typed raw-HTML guard.
The Markdown-It renderer callback tuple is forwarded without exceeding the
parameter limit. Added alias/fold and math/block-ID units; existing render
security, nested-callout and Markdown assertions remain unchanged.

Backlog since preceding unit → now: max-lines-per-function 37 → 35; complexity
18 → 17; max-params 6 → 5; no-nested-ternary 10 → 10; max-depth 1 → 0;
no-restricted-syntax 0 → 0. Distinct files 48 → 44. No new lint exceptions.
Unit count 242 → 244. Checks: `pnpm check` 244/244; `pnpm test:browser` 14/14.
Native not rerun: pure rendering rules, no native wiring change. Logs:
`docs/checks/readability-html-{check,browser}.txt`.
Ledger unchanged: 87/15/2/333/11. Deviations: none; no behavior fixes.
Existing Live Preview, Math and Callouts manual scenarios cover these rules;
owner acceptance remains unrun.

Known issues / exact remaining work: the 44 files remaining in eslint.legacy.mjs,
remaining plugin README rewrites and manual regression inventory; then remove
the empty backlog/config block and run readability completion checks. Remaining
Phase 4 plugins and Phases 5–8 are unchanged and still incomplete.

### Readability pass progress — Commands, 2026-10-08

Delivered: named per-panel action binding, host palette and feature-command
reconciliation/invocation guards. Webview command map is a pure registry; apply
lists service, host-action, RPC and key registrations. Action ordering remains
flush → focus guard → native action inside the session queue. README rewritten
and command regression scenarios added; old README progress text is superseded
by existing Phase 3 completion records. No new feature behavior.

Backlog since preceding unit → now: max-lines-per-function 35 → 32; complexity
17 → 17; max-params 5 → 5; no-nested-ternary 10 → 10; max-depth 0 → 0;
no-restricted-syntax 0 → 0. Distinct files 44 → 41. No exceptions added.
Registry unit raises count 244 → 245. Checks in order: `pnpm check` 245/245;
`pnpm test:browser` 14/14; `pnpm test:vscode` 1/1, fresh isolated-profile VSIX.
Logs: `docs/checks/readability-commands-{check,browser,native}.txt`.
Ledger unchanged: 87/15/2/333/11. Deviations: none; no intentional bug fixes.

Known issues / exact remaining work: remaining 41 backlog files, other plugin
READMEs and manual regressions; remove empty backlog/config block and run
readability completion checks. Remaining Phase 4 plugins and Phases 5–8 are
still undelivered as recorded above. Owner manual acceptance remains unrun.

### Readability pass progress — Document, 2026-10-08

Delivered: `ViewConnection` owns attachment, buffered updates, synchronization
and strict draft flushes; webview apply lists service/update/flush registrations.
Input grouping separates boundary checks from ordinary typing continuity. Native
edit iteration uses the library's typed callback tuple. README and manual
regression inventory updated. Added two transaction-based grouping units without
expanding the browser/native suites; original draft-flush assertions remain.

Backlog since preceding unit → now: max-lines-per-function 32 → 31; complexity
17 → 16; max-params 5 → 4; no-nested-ternary 10 → 10; max-depth 0 → 0;
no-restricted-syntax 0 → 0. Distinct files 41 → 38. No new lint exceptions.
Unit count 245 → 247. Checks in order: `pnpm check` 247/247;
`pnpm test:browser` 14/14; `pnpm test:vscode` 1/1, freshly packaged isolated /tmp
profile. Logs: `docs/checks/readability-document-{check,browser,native}.txt`.
Ledger independently recounted: 87 ported, 15 rewritten, 2 changed, 333 retired,
11 todo; 448 total. Deviations: none. No behavior bug fixed.

Known issues / exact remaining work, readability first:
- Backlog: host/navigation; markdown/metadata/index; markdown/properties
  edits/merge/order/scalar-edits; markdown/search canvas/query; markdown/tables/model;
  plugins/callouts/webview; codeBlocks code-highlight/code-selection/code-source/
  webview; diagrams/webview; embeds image-dialog/image/post-process/webm/webview;
  formatting inline/lines/webview; links host/webview; livePreview inline/
  rendered-position/webview; math commands/webview; render/webview; resources/host;
  tasks/webview; vim/webview; shared/fuzzy; shared/rpc/endpoint; webview/features;
  webview/ui/menu. These are the exact 38 remaining files in eslint.legacy.mjs.
- README template pass still needed for autoPair, callouts, codeBlocks, diagrams,
  dialect, embeds, folding, formatting, indentGuides, lineNumbers, links,
  livePreview, math, render, resources, smartLists, spellcheck, tasks, vault, vim.
  Extend manual regressions for each rewritten plugin. Kernel why-comments are
  done. After all entries comply, delete backlog/config block and write the dated
  readability completion record with ordered completion checks.
- Phase 4: inlineTitle rename/focus/view transfer; tags; suggest sources/channels;
  search worker/cancellation; pasteHtml including table cells; copyForAgent;
  markers. Each needs contributions, lifecycle/composition units, README and manual
  scenarios. No new Phase 4 plugin was delivered in this run.
- Phase 5: shared live per-vault index, nearest-marker roots, workers, persistence,
  unsaved overlays, exclusions, incremental resolution, consumer migration,
  unresolved styling, outline/symbols, backlinks/unlinked mentions, outgoing links,
  tags view, rename link updates, quick switcher, word count and 10,000-note measure.
- Phase 6: complete commands/settings routing, plugin management, workspace editor
  association, manual inventory and PARITY.md. Keep verify bindings unbound.
- Phase 7: frozen facade/declarations, isolated external contexts, selection/error
  handling, marker mapping, external actions/processors, full facade tests/API.md.
- Phase 8: packaging/notices/allowlist audit, release docs, sample external plugin,
  complete handover, zero todo ledger rows and ordered final release checks.
- Owner acceptance remains unrun. Prioritize table drag/scroll and cell projection,
  Properties drafts/IME/row operations, then two-panel state/undo and plugin toggles.

Cumulative readability counts so far: 86 → 38 distinct files;
66 → 31 long-function, 33 → 16 complexity, 13 → 4 parameter,
19 → 10 nested-ternary, 1 → 0 depth, 6 → 0 receiver-pattern files;
215 → 247 unit tests. The readability pass and all requested later phases remain
incomplete. No external tool, permission or resource blocker has been identified.
No push, publication, owner-profile installation or source-repository changes.
