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
- Keep each phase's tree green. Run checks in this order, never two at once
  (the smoke suites load built files):

  ```sh
  pnpm check            # lint, typecheck, unit tests, contributions check
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

## Phase 5 — Vault index and host features

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
