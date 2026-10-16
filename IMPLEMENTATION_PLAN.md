# Markdown Workshop — implementation plan

Companion to [DESIGN.md](DESIGN.md). It lists the phases in order, what each
must deliver, how to check it, and where every source file goes. Section
numbers such as §12 refer to DESIGN.md.

## Testing policy (clarified 10 October 2026)

The owner will accept the extension by testing it hands-on with computer use.
New automated coverage is **unit tests by default**; existing browser and
native suites remain required checks:

- Port a source unit test when it still covers behaviour that exists here.
  Write unit tests for new logic (kernel, vault resolution, plugin wiring,
  routing, API) using `test/support/vscode-fake.ts` and in-memory fakes.
- Do **not** port the source browser suites, native suites or fuzzers. Mark
  their ledger rows `retired` with the reason "covered by computer-use
  acceptance (docs/MANUAL_TEST_PLAN.md)".
- Keep the existing suites (`pnpm test:browser`, `pnpm test:vscode`),
  including later owner-approved targeted regressions. Fix them when a
  change breaks them; add browser/native coverage only with explicit owner
  approval. Historical test counts below describe those runs, not the
  current suite size.
- For broader acceptance, maintain `docs/MANUAL_TEST_PLAN.md`:
  scenarios the owner runs with computer use, grouped by plugin. Each has
  setup (a note in `test/fixtures/vault`), steps and the expected result.
  Draw them from the retired source scenarios and DESIGN §13–§17; one
  scenario may cover several retired tests. Add each plugin's scenarios in
  the phase that delivers the plugin.

This replaces every earlier requirement below to port browser or native
suites, fuzzers or flaky-test investigations. Phase 3's first record is
re-judged under this policy.

The CI-drop change requires `pnpm check:full` before **every push**, regardless
of which files changed. It runs `check`, `test:browser`, then `test:vscode`
sequentially and stops on the first failure. `check` already includes unit
tests. Real-VS Code tests stay local; GitHub Actions does not run them.
Packaging and the other CI jobs are separate checks, not part of `check:full`.

On a busy shared host, `MARKDOWN_WORKBENCH_TEST_CONCURRENCY=1` limits unit-test
workers without changing assertions or performance deadlines. To run the existing
native scenarios without installing a VSIX, set
`MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1`; the harness loads the built checkout with
`--extensionDevelopmentPath` and keeps its disposable profile, home and extensions
directory. The default native run still tests the packaged extension.

On macOS, an empty test home can prompt for Keychain access. For credential-free
synthetic runs, `VSCODE_TEST_MOCK_KEYCHAIN=1` opts into Chromium's mock Keychain.
It is off by default; never use it with real accounts or personal profiles.
The native harness requests custom rendered menus for its DOM driver. Some forks
(including Cursor 3.23 on macOS) still use native menus; verify those paths with
native computer-use rather than replacing menu assertions with palette commands.

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
  pnpm test:browser     # existing Chromium suite
  pnpm test:vscode      # existing native suite in an isolated VS Code profile
  ```

  `pnpm check:full` runs those three in order. On headless Linux, use
  `xvfb-run -a pnpm check:full` with its private display. Coordinate suites
  across shared worktrees; never reuse or terminate an unrelated test server.

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

### Properties chip removal reconciliation — 2026-10-16

Delivered: list rows retain focused add-input and chip-editor drafts only. A
focused remove button no longer keeps stale chips after the authoritative YAML
loses an item. `title` keeps its existing behavior.

Coverage: a focused remove-button unit fails on the previous guard and passes
with the fix, checking that reconciliation replaces two tag chips with one.
Companion units preserve nonempty add-input and chip-editor drafts. No source
tests were ported and no browser/native scenarios were added.

Checks: Node 22 under the shared suite lock: `pnpm check` passes (1,794 unit
passes, 23 intentional Cordis skips), the requested
`properties-parity.spec.ts` passes (1/1), full Chromium passes (276/276), and
native VS Code 1.142.0 passes (23/23) on a private Xvfb display with
`MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1`. The first native attempt could not start
because an incomplete cached runtime lacked `out/main.js`; retrying with a
complete cached runtime passed. No VSIX, push, PR, merge or publication.

### Properties editability and click parity — 2026-10-16

Delivered: nested maps/lists and block values keep their raw YAML drafts when
possible, with a standalone serialized fallback for settable values whose slices
cannot parse independently (for example, aliases defined in another property).
Tagged, recursive and unsupported values show a Source mode message instead of
read-only chips. Blank row/value clicks focus the existing value editor while
native caret placement, pill actions, links and row/text selection are preserved.
The key column is wider and responsive, with constrained ellipsis and full-name
tooltips. `title` remains an ordinary editable text property. Sources keeps its
custom stacked rows above YAML, including an empty list.

Coverage: unit regressions for maps/lists of maps, independent draft fallback,
committing resolved aliases, raw comment/quote/exact-number preservation,
unsupported values, current-source control enablement, title visibility,
long key identity and click routing. Updated the plugin README, parity inventory
and owner manual scenarios. No browser/native coverage was added or ported.

Checks: focused properties/YAML/Sources units pass (133/133). The committed
implementation at `0377e84` passes `pnpm check:full` sequentially under the shared
suite lock with Node 22.20.0: format/lint/typecheck/contributions green, 1,769 unit
passes and 23 intentional Cordis skips, Chromium 276/276, native VS Code 1.142.0
23/23. Native checks use a private Xvfb display and the isolated unpackaged
harness (no VSIX). No browser/native scenarios were added.
The pinned `~/Code/human-learning` checkout is unavailable; no source repository
or other worktree was modified. GUI Obsidian↔MW side-by-side verification is
VERIFY-NEEDED and owned by Grok Bot computerUse. A serialized fallback may lose
formatting or numeric precision on commit; verbatim drafts remain preferred.

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

### Readability pass progress — Fuzzy matching, 2026-10-08

Delivered: separated grapheme normalization, non-overlapping whole-token matching,
ordered subsequence fallback, contiguous ranges and source-coordinate mapping.
The scoring formula and original UTF-16 highlights are preserved. Added two units
covering reordered tokens, fallback ordering, occupied matches and normalization.
Backlog: 38 → 37 distinct files; long-function 31 → 30; complexity 16 → 15;
other rule counts unchanged. No new exemptions, inline disables or behavior fixes.
Checks: `pnpm check` 249/249. Smoke suites not rerun for this pure helper rewrite;
no webview or native wiring changed. Log: `docs/checks/readability-fuzzy-check.txt`.
Ledger unchanged: 87 ported / 15 rewritten / 2 changed / 333 retired / 11 todo.
Deviations: none. Owner acceptance remains unrun.

Known issues: finish the remaining 37 eslint.legacy.mjs files, remaining README
and manual regression inventory, then ordered readability completion checks.
Phase 4 inlineTitle, tags, suggest, search, pasteHtml, copyForAgent and markers
remain. Phase 5 belongs exclusively to Claude on claude/phase5-vault; do not
change its branch, worktree or VaultIndex interface. Phase 6 must wait for the
Phase 5 completion record on main. Phase 6 command/settings/parity, Phase 7 API
and Phase 8 packaging/documentation deliverables remain as listed above.

### Readability pass progress — YAML ordering and scalars, 2026-10-08

Delivered: property ordering separates entry/source-token discovery, flow/block
reordering and value-preservation verification. Scalar serialization names its
quote-style policy. Added two units for CRLF flow maps, unsupported numeric keys,
negative zero and multiline strings. Existing alias/comment/quoting tests remain.
Backlog: 37 → 35 distinct files; long-function 30 → 29; complexity 15 → 13;
other counts unchanged. No new exemptions, inline disables or behavior fixes.
Checks: `pnpm check` 251/251, including formatting/lint/types/contributions.
Log: `docs/checks/readability-property-order-check.txt`. Smoke suites not rerun:
only pure YAML helpers changed. Ledger: 87/15/2/333/11, unchanged.
Deviations: none. Existing Properties manual regressions cover sorting and scalar
editing; owner acceptance remains unrun.

Known issues: the remaining 35 backlog files, README/manual inventory and ordered
readability completion checks; then Phase 4 inlineTitle, tags, suggest, search,
pasteHtml, copyForAgent and markers. Claude owns Phase 5; its completion record
must be on main before Phase 6. Phases 6–8 remain as specified in the plan.

### Readability pass progress — Structural YAML edits, 2026-10-08

Delivered: structural editing now validates the request, finds or creates the
header, delegates add/rename/remove/set to a YAML map editor, then verifies the
candidate. Each map operation owns its source changes; untouched YAML remains
byte-preserved. Added a unit for absent/duplicate keys, atomic removal rejection
and no-op rename/removal. Existing tests and assertions are unchanged.
Backlog: 35 → 34 distinct files; long-function 29 → 28; complexity 13 → 12;
other counts unchanged. No new exceptions or intentional behavior change.
Checks: `pnpm check` 252/252; log `docs/checks/readability-property-edits-check.txt`.
Smoke suites not rerun: pure YAML logic only. Ledger unchanged: 87/15/2/333/11.
Deviations: none. Existing Properties manual regressions cover these operations.
Known issues: remaining 34 backlog files and README/manual inventory before
readability completion; Phase 4's seven remaining plugins; Claude's Phase 5
handoff gate; Phases 6–8 as specified above. Owner acceptance remains unrun.

### Readability pass progress — Math, 2026-10-08

Delivered: apply lists cleanup, renderer, typesetting and command registrations;
node typesetting receives only its node, pass, cleanup set and logger. Preserved
registration/disposal ordering and late-result cancellation. Named delimiter
placement and added a unit for line-start/mid-line/empty-document insertion.
README follows the template; manual regression inventory includes pending loads.
Backlog: 34 → 32 distinct files; long-function 28 → 27; nested-ternary 10 → 9;
other counts unchanged. No new exceptions, inline disables or behavior fixes.
Checks in order: `pnpm check` 253/253; `pnpm test:browser` 14/14. Native not
rerun: no native wiring change. Logs: `docs/checks/readability-math-{check,browser}.txt`.
Ledger unchanged: 87/15/2/333/11. Deviations: none. Manual acceptance unrun.
Known issues: remaining 32 backlog files, remaining README/manual inventory and
ordered readability completion checks; Phase 4 inlineTitle/tags/suggest/search/
pasteHtml/copyForAgent/markers; Claude's Phase 5 handoff gate; Phases 6–8 as planned.

### Readability pass progress — Diagrams, 2026-10-08

Delivered: apply names block and fence registrations; DiagramRenderer owns the
serial Mermaid queue, render identities, per-pass cancellation and restoration.
The lazy-load/security/sanitization behavior and cleanup ordering are unchanged.
README follows the template; manual regressions include queued loads and errors.
Backlog: 32 → 31 distinct files; long-function 27 → 26; other counts unchanged.
No new exemptions, inline disables, pure algorithm or intentional behavior fix.
Checks in order: `pnpm check` 253/253; `pnpm test:browser` 14/14. Native not
rerun: no native wiring change. Logs: `docs/checks/readability-diagrams-{check,browser}.txt`.
Ledger unchanged: 87/15/2/333/11. Deviations: none. Manual acceptance unrun.
Known issues: remaining 31 backlog files, README/manual inventory and readability
completion checks; Phase 4's seven remaining plugins; Claude's Phase 5 handoff;
Phases 6–8 as specified above. No phase completion is claimed.
### Phase 5 (incomplete) — Vault index and host features, part 1 (Claude), 2026-10-08

Delivered: the vault index (DESIGN §12) replaces the Phase 3 stub behind the
unchanged `VaultIndex` interface, extended with `file(path)` and a
`VaultChange` argument for change listeners. One index per vault is shared by
panels and views (`vaults` service), with root discovery from
`vault.rootMarkers`, a warm start from a persisted snapshot, reconciliation by
time and size, parsing in `dist/workers/vault.cjs` one note at a time, file and
folder events, unsaved text of open notes, Obsidian's `getLinkpathDest` order,
incremental re-resolution, excluded files and a 50,000-file limit. Host
features: Backlinks (linked and unlinked mentions, status bar count), Outgoing
Links, Markdown Outline (beside this editor, following the caret), Quick Switcher,
Word Count and Link Updates (prompt/always/never, folder renames). The VS Code
side is `src/host/vault-system.ts` and `src/host/views.ts`;
`scripts/measure-vault.ts` (`pnpm measure:vault`) measures the budgets.
Checks: `pnpm check` (330 passed after rebasing on main), `pnpm test:browser` (14/14),
`pnpm test:vscode` (1/1, isolated profile).
Measurements (10,000 generated notes, 35 MB, worker parsing, Apple Silicon,
with Codex building on the same machine): cold index 5.1–5.7 s with the longest
host block 19–23 ms; warm start until links resolve about 1.0 s with the longest
block about 17 ms (one outlier of 74 ms under load); reconciliation after a warm
start about 90 ms, longest block 2 ms. Snapshot 55 MB in 129 files.
Ledger: 87/16/2/333/10 (ported/rewritten/changed/retired/todo); the nested-vault
property scope test is rewritten as a root-discovery test.
Deviations from DESIGN.md:
- Excluded files follow Obsidian: indexed and resolvable, flagged `excluded`
  and left out of the switcher, suggestions, search and unlinked mentions
  (DESIGN §12.2 updated).
- `vault/changed` and `vault/resolved` carry the vault root (DESIGN §7.3 updated).
- No `DocumentSymbolProvider`: VS Code's Markdown support already provides one,
  and a second would list headings twice. Markdown Outline shows only beside this
  editor.
- Window-level plugins (views, switcher, word count, link updates) are listed in
  `workbenchFeatures` in the catalog, switched by `workbench-features.ts`, and
  are not part of the editor composition tests, which have no editor half to
  compose.
- The snapshot is sharded and packs positions (DESIGN §12.2 says one JSON file).
Known issues:
- Tags view and unresolved-link styling in `links` wait for Phase 4's `tags`
  and `links` changes; `suggest`, `tags` and `search` must use the vault index
  (not scans) when they land. Claude does these after rebasing on Phase 4.
- The host block is at or slightly above the 16 ms budget on 10,000 notes; the
  remaining cost is replacing the file list and resolving one batch of links.
- Plugin-local `*.test.ts` files under `src/plugins` are not in any tsconfig
  project, so they are run but not type-checked; Phase 5 tests live under
  `test/unit` for that reason.
- Manual acceptance (docs/MANUAL_TEST_PLAN.md, Phase 5 section) not run.

### Readability pass progress — Callouts, 2026-10-08

Delivered: named theme, block renderer, disclosure post-processing and insertion
registrations. Disclosure DOM handlers receive only the details element, lifetime
signal and remember callback; saved per-panel memory and registration order remain
unchanged. README and manual regression inventory follow the required template.
Backlog: 31 → 30 distinct files; long-function 26 → 25; other counts unchanged.
No new exemptions, inline disables, pure algorithm or intentional behavior fix.
Checks: `pnpm check` 331/331; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-callouts-{check,browser}.txt`.
Ledger: 87/16/2/333/10 after Claude’s Phase 5 part-one merge. Deviations: none. Manual acceptance unrun.
Known issues: remaining 30 backlog files, README/manual inventory and readability
completion checks; remaining Phase 4 plugins, Claude's Phase 5 handoff gate and
Phases 6–8 as listed above.

### Readability pass progress — Tasks, 2026-10-08

Delivered: inline renderer and checklist commands have named registrations;
rendered control binding lives in post-process.ts with explicit local versus
embedded edit routing. It receives only render, editing, RPC and logging
capabilities. Expected-line checks and disabled-preview/disposal behavior remain.
README rewritten; manual regression inventory includes stale lines and toggles.
Backlog: 30 → 29 distinct files; long-function 25 → 24; other counts unchanged.
No new exceptions, inline disables, pure algorithm or intentional behavior fixes.
Checks: `pnpm check` 331/331; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-tasks-{check,browser}.txt`.
Ledger: 87/16/2/333/10 after Claude’s Phase 5 part-one merge. Deviations: none. Owner acceptance unrun.
Known issues: remaining 29 backlog files and README/manual inventory, followed by
readability completion checks; Phase 4's remaining seven plugins, Claude's Phase 5
handoff gate and Phases 6–8 as specified above.

### Readability pass progress — Formatting, 2026-10-08

Delivered: named command assembly, command/key registrations, caret-based unwrap,
word wrapping and selected-text toggling. Line-prefix selection has an explicit
branch. Added two units for caret/word/empty selection and independent multiple
ranges. README/manual regressions updated; existing source assertions retained.
Backlog: 29 → 26 distinct files; long-function 24 → 22; nested-ternary 9 → 8;
other counts unchanged. No exceptions or intentional behavior fixes.
Checks: `pnpm check` 333/333; `pnpm test:browser` 14/14. Native not rerun:
formatting changed no native wiring. Logs: `docs/checks/readability-formatting-{check,browser}.txt`.
Ledger: 87/16/2/333/10 after Claude's Phase 5 part-one merge. Corrected preceding
Callouts/Tasks records to their actual 331-test logs; the merge added 78 tests.
Deviations: none. Manual acceptance remains unrun.
Known issues: remaining 26 backlog files and README/manual inventory, then ordered
readability completion checks; remaining Phase 4 plugins. Phase 5 part one is on
main but not complete; Claude owns its remaining consumer migration, Tags view
and unresolved styling. Do not start Phase 6 without its completion record.
Phases 6–8 remain as specified above.

### Readability pass progress — Table alignment, 2026-10-08

Delivered: replaced nested alignment ternaries with explicit center/left/right
branches, preserving divider parsing and all table behavior. No logic extraction
or new tests; existing alignment/round-trip units remain intact.
Backlog: 26 → 25 distinct files; nested-ternary 8 → 7; other counts unchanged.
Checks: `pnpm check` 333/333; log `docs/checks/readability-table-model-check.txt`.
Smoke suites not rerun for this pure branch rewrite. No new lint exceptions.
Ledger: 87/16/2/333/10. Deviations: none. Manual acceptance unrun.
Known issues: remaining 25 backlog files and README/manual inventory before
readability completion; Phase 4's remaining plugins; Claude's incomplete Phase 5
handoff; Phases 6–8 remain as specified above.

### Readability pass progress — RPC dispatch, 2026-10-08

Delivered: endpoint dispatch separates response settlement, notification delivery,
request execution and result validation; outbound validation delegates request
lifetime setup. Cancellation/error primitives live in lifecycle.ts, re-exported
through the unchanged endpoint API. Added cancellation-listener and duplicate-ID
units; validation, timeout, handler-disable and late-result assertions remain.
Backlog: 25 → 24 distinct files; long-function 22 → 21; complexity 12 → 11;
other counts unchanged. No new exceptions or intentional behavior fixes.
Checks: `pnpm check` 335/335; `pnpm test:browser` 14/14. Native not rerun:
no native adapter wiring change. Logs: `docs/checks/readability-rpc-{check,browser}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Owner acceptance unrun.
Known issues: remaining 24 backlog files and README/manual inventory; ordered
readability completion checks; Phase 4's seven plugins; Claude's incomplete
Phase 5 handoff and Phases 6–8 as specified above.

### Readability pass progress — Feature reconciliation, 2026-10-08

Delivered: a controller owns the serialized settings queue and active fibers;
per-feature enable/disable/update is separate from catalogue traversal. Parsing,
configuration signatures, update rather than recreation, disposal guards and
render invalidation remain unchanged. No pure algorithm added.
Backlog: 24 → 23 distinct files; complexity 11 → 10; other counts unchanged.
Checks: `pnpm check` 335/335; `pnpm test:browser` 14/14. Native not rerun:
webview reconciliation only. Logs: `docs/checks/readability-features-{check,browser}.txt`.
Ledger: 87/16/2/333/10. No new lint exceptions or behavior fixes. Deviations: none.
Known issues: remaining 23 backlog files, README/manual inventory and ordered
readability completion checks, then the remaining Phase 4 plugins. Claude's
Phase 5 is incomplete; Phases 6–8 remain gated. Owner composition/manual scenarios
are documented but unrun.

### Readability pass progress — Metadata collection, 2026-10-08

Delivered: metadata entry point owns caching and assembly; collect.ts owns
reference definitions and syntax collection with separate wiki/Markdown/list
operations; block-extract.ts owns block-ID targeting and opaque-syntax exclusion.
Footnote bodies retain offset mapping into original source. Added two units for
footnote links/tags/list parents, standalone/opaque block IDs and alias forms.
Backlog: 23 → 22 distinct files; long-function 21 → 20; complexity 10 → 9;
nested-ternary 7 → 6; other counts unchanged. No new exceptions or behavior fixes.
Checks: `pnpm check` 337/337; log `docs/checks/readability-metadata-check.txt`.
Smoke suites not rerun: pure metadata only. Ledger: 87/16/2/333/10.
Deviations: none. Existing Footnotes/Properties/core manual scenarios cover
consumers; owner acceptance remains unrun.
Known issues: remaining 22 backlog files, README/manual inventory and ordered
readability completion checks; Phase 4 remaining plugins, Claude's incomplete
Phase 5 handoff, then Phases 6–8 as specified above.

### Readability pass progress — Code Blocks, 2026-10-08

Delivered: selected-fence discovery/caching is separate from lazy highlighter
loading and viewport traversal; render-pass controls, copy and source reveal have
named operations. Source-offset mapping takes named coordinates; Prism aliases
use explicit branching. Added a fence-boundary selection unit without changing
existing offset assertions. README/manual inventory updated.
Backlog: 22 → 18 distinct files; long-function 20 → 18; complexity 9 → 8;
parameters 4 → 3; nested-ternary 6 → 5. No new exceptions or behavior fixes.
Checks: `pnpm check` 338/338; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-codeblocks-{check,browser}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Owner acceptance unrun.
Known issues: remaining 18 backlog files, README/manual inventory and ordered
readability completion checks; remaining Phase 4 plugins; Claude's incomplete
Phase 5 handoff and Phases 6–8 as specified above.

### Readability pass progress — Vim, 2026-10-08

Delivered: apply names service, host-shortcut consumer, native action hooks, Ex
commands and editor-extension registrations. Hook restoration, inert stopped Ex
callbacks and table-cell mode transfer remain unchanged. README removes stale
migration status and documents actual service/limits; manual inventory updated.
Backlog: 18 → 17 distinct files; long-function 18 → 17; other counts unchanged.
Checks: `pnpm check` 338/338; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-vim-{check,browser}.txt`.
Ledger: 87/16/2/333/10. No new exceptions, pure algorithms or behavior fixes.
Deviations: none; existing removeEx limitation remains. Owner acceptance unrun.
Known issues: remaining 17 backlog files, README/manual inventory and readability
completion checks, remaining Phase 4 plugins, Claude's incomplete Phase 5 handoff
and Phases 6–8 as specified above.

### Readability pass progress — Render pipeline, 2026-10-08

Delivered: render pass lifetime, remote-content restrictions and fence dispatch
are separate responsibilities; apply owns cleanup and service assembly. Preserved
preprocess/sanitize/fence/postprocess/measure order, trust rules and abort checks.
Added a unit for reverse cleanup, reentrant disposal and late registrations.
README/manual inventory updated, removing stale Phase 3 progress prose.
Backlog: 17 → 16 distinct files; long-function 17 → 16; complexity 8 → 7;
other counts unchanged. No new lint exceptions or intentional behavior fixes.
Checks: `pnpm check` 339/339; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-render-{check,browser}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Owner acceptance unrun.
Known issues: remaining 16 backlog files, README/manual inventory and readability
completion checks; remaining Phase 4 plugins, Claude's incomplete Phase 5 handoff
and Phases 6–8 as specified above.

### Readability pass progress — Resources, 2026-10-08

Delivered: NoteResources owns each panel's known sources, authorization, contained
stat/read operations and resource classification. Host apply registers the service
and RPC. Kept the VaultIndex interface unchanged, realpath/virtual-symlink checks,
unsaved native text and mtime URLs. Added a kind-precedence/fallback unit; README
and manual regressions updated without the obsolete snapshot-resolver claim.
Backlog: 16 → 15 distinct files; long-function 16 → 15; nested-ternary 5 → 4;
other counts unchanged. No new exceptions or intentional behavior fixes.
Checks in order: `pnpm check` 340/340; `pnpm test:browser` 14/14;
`pnpm test:vscode` 1/1, freshly packaged in the isolated /tmp profile.
Logs: `docs/checks/readability-resources-{check,browser,native}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Owner acceptance unrun.
Known issues: remaining 15 backlog files and README/manual inventory before
readability completion checks, remaining Phase 4 plugins, Claude's incomplete
Phase 5 handoff and Phases 6–8 as specified above.

### Readability pass progress — Query grammar, 2026-10-08

Delivered: SearchParser owns its cursor and named expression/unary/group/property/
quoted/regex/unquoted rules. File-search detection uses explicit union branches.
Added two units for recursive file scope detection, property literals/negative
numbers and exact parse-error positions. Original search assertions are intact.
Backlog: 15 → 14 distinct files; long-function 15 → 14; complexity 7 → 6;
nested-ternary 4 → 3; other counts unchanged. No exceptions or behavior fixes.
Checks: `pnpm check` 342/342; log `docs/checks/readability-query-check.txt`.
Smoke suites not rerun: pure parser rewrite. Ledger: 87/16/2/333/10.
Deviations: none. Search feature delivery remains Phase 4, not this rewrite.
Known issues: remaining 14 backlog files and README/manual inventory, ordered
readability completion checks, remaining Phase 4 plugins, Claude's incomplete
Phase 5 handoff and Phases 6–8 as specified above. Owner acceptance unrun.

### Readability pass progress — YAML merge, 2026-10-08

Delivered: merge request validation, value combination, YAML edit accumulation
and final-value verification are separate operations. MergeEdits owns only the
source/header/parsed document and accumulated edits. Added a regression for
existing null-versus-falsy replacement behavior and appended values; original
structured clipboard/cycle/alias assertions remain unchanged.
Backlog: 14 → 13 distinct files; long-function 14 → 13; complexity 6 → 5;
other counts unchanged. No new exceptions or intentional behavior fixes.
Checks: `pnpm check` 343/343; log `docs/checks/readability-property-merge-check.txt`.
Smoke suites not rerun: pure YAML rewrite. Ledger: 87/16/2/333/10.
Deviations: none. Existing Properties clipboard manual scenarios cover consumers.
Known issues: remaining 13 backlog files and README/manual inventory before
readability completion checks, remaining Phase 4 plugins, Claude's incomplete
Phase 5 handoff and Phases 6–8 as specified above. Owner acceptance unrun.

### Readability pass progress — Editor menus, 2026-10-08

Delivered: MenuSession owns panel stacks, focus, submenu and dismissal lifetimes;
button construction, command invocation and viewport placement are named units.
The internal opener takes an options object; the injected Menu API is unchanged.
Added a pure key-navigation unit including wraparound and empty menus. Test lives
under test/unit because webview production tsconfig intentionally excludes Node.
Backlog: 13 → 12 distinct files; long-function 13 → 12; parameters 3 → 2;
other counts unchanged. No new lint exceptions or intentional behavior fixes.
Checks: `pnpm check` 344/344; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-menu-{check,browser}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Manual regression inventory updated;
owner acceptance unrun.
Known issues: remaining 12 backlog files and README/manual inventory, ordered
readability completion checks, remaining Phase 4 plugins, Claude's incomplete
Phase 5 handoff and Phases 6–8 as specified above.

### Readability pass progress — Links, 2026-10-08

Delivered: named initial-navigation, opener, wikilink renderer, click-handler and
command registrations. Host routing separates authorization/claims, external
scheme policy and internal resolution. Existing click-selection and initial-reply
lifetimes are preserved. README/manual inventory updated; no Phase 5 styling work.
Backlog: 12 → 10 distinct files; long-function 12 → 10; complexity 5 → 4;
other counts unchanged. No new exemptions, pure algorithms or behavior fixes.
Checks in order: `pnpm check` 344/344; `pnpm test:browser` 14/14;
`pnpm test:vscode` 1/1, freshly packaged in its isolated /tmp profile.
Logs: `docs/checks/readability-links-{check,browser,native}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Owner acceptance unrun.
Known issues: host/navigation, markdown/search/canvas, embeds image-dialog/image/
post-process/webm/webview, livePreview inline/rendered-position/webview remain in
the backlog. Finish remaining README/manual inventory and readability completion
checks, then Phase 4 inlineTitle/tags/suggest/search/pasteHtml/copyForAgent/markers.
Claude owns remaining Phase 5 consumers/styling; its completion record must precede
Phase 6. Phases 6–8 remain as specified above.

### Readability pass progress — Native navigation, 2026-10-08

Delivered: separate local-realpath and virtual-symlink containment, resolution,
note creation and native opening operations. The existing five-argument Navigation
contract is adapted with its typed parameter tuple to named internal options;
callers (including Claude's vault registry) and VaultIndex remain unchanged.
No pure algorithm added, no behavior fixes, exemptions or inline disables.
Backlog: 10 → 9 distinct files; long-function 10 → 9; complexity 4 → 3;
parameters 2 → 1; other counts unchanged.
Checks in order: `pnpm check` 344/344; `pnpm test:browser` 14/14;
`pnpm test:vscode` 1/1, freshly packaged isolated /tmp profile. Logs:
`docs/checks/readability-navigation-{check,browser,native}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Manual inventory updated; acceptance unrun.
Known issues: markdown/search/canvas; embeds image-dialog/image/post-process/webm/
webview; livePreview inline/rendered-position/webview; remaining README/manual
inventory and readability completion checks. Then remaining Phase 4 plugins,
Claude's Phase 5 completion gate, and Phases 6–8 as specified above.

### Readability pass progress — Canvas search data, 2026-10-08

Delivered: canvas-data.ts validates node/edge identity and optional fields;
canvas geometry names side selection, coordinate offsets and self-loop routing.
Public exports and validation errors remain unchanged. Added three units for
invalid payloads/edges, coordinate mapping, facing curves and full self loops.
Backlog: 9 → 8 distinct files; long-function 9 → 8; complexity 3 → 2;
nested-ternary 3 → 2; other counts unchanged. No new exceptions or behavior fixes.
Checks: `pnpm check` 347/347; log `docs/checks/readability-canvas-data-check.txt`.
Smoke suites not rerun: pure data/geometry only. Ledger: 87/16/2/333/10.
Deviations: none; this preserves existing search foundation, not a Canvas feature.
Known issues: embeds image-dialog/image/post-process/webm/webview and livePreview
inline/rendered-position/webview; remaining README/manual inventory and readability
completion checks. Then remaining Phase 4 plugins, Claude's Phase 5 completion
gate and Phases 6–8 as specified above. Owner acceptance unrun.

### Readability pass progress — Live Preview, 2026-10-08

Delivered: an inline decoration builder owns ranges/line deduplication and named
bullet/block/link/syntax operations; custom renderers retain detached callable
context methods. Source projection separates syntax removal from offset mapping.
Apply names engine, invalidation, fallback and mode registrations. README corrects
stale renderer-priority prose; manual regressions include drag/IME and toggles.
Added three units for basic/custom decorations and Unicode/empty projections.
Backlog: 8 → 5 distinct files; long-function 8 → 5; complexity 2 → 1;
nested-ternary 2 → 1; parameters unchanged at 1. No new exceptions or behavior fixes.
Checks: `pnpm check` 350/350; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-livepreview-{check,browser}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Owner acceptance unrun.
Known issues: Embeds image-dialog/image/post-process/webm/webview are the five
remaining backlog files. Finish remaining README/manual inventory and ordered
readability completion checks, then Phase 4 inlineTitle/tags/suggest/search/
pasteHtml/copyForAgent/markers. Claude's Phase 5 completion gate and Phases 6–8
remain as specified above.

### Readability pass progress — Image inspection, 2026-10-08

Delivered: ImageControls owns zoom state, toolbar, keyboard/wheel, pan and resize
registrations; ImageInspector owns dialog lifetime, saved scale and focus return.
Controls take named options rather than seven parameters. Added saved-scale
validation/legacy actual-size unit; manual zoom/pan/loading regressions added.
Backlog: 5 → 3 distinct files; long-function 5 → 3; parameters 1 → 0;
nested-ternary 1 → 0; complexity unchanged at 1. No new exceptions or behavior fixes.
Checks: `pnpm check` 351/351; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-images-{check,browser}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Owner acceptance unrun.
Known issues: Embeds post-process/webm/webview, remaining README/manual inventory
and readability completion checks. Then remaining Phase 4 plugins, Claude's
Phase 5 completion gate and Phases 6–8 as specified above.

### Readability pass progress — WebM recovery, 2026-10-08

Delivered: binary metadata/cluster processing in webm-stream.ts, browser recovery
in media-recovery.ts, and MediaSource buffer/event handling in media-source.ts;
webm.ts preserves the public exports. Unknown-size boundary detection, timestamp
ordering, cancellation and Opus-preroll behavior remain unchanged. Added a unit
for truncated and invalid unknown-size elements; source fixture tests retained.
Backlog audit found stale compact-array entries for navigation/image parameters,
image ternaries and WebM complexity that earlier line-based removal missed.
Removed them and reran check: only post-process.ts and webview.ts long-function
entries remain (2 distinct files; all other rule lists empty). Earlier progress
counts described rewritten files; this record corrects actual exemption removal.
No new exemptions, inline disables or intentional behavior fixes.
Checks: `pnpm check` 352/352; `pnpm test:browser` 14/14. Native not rerun:
no native wiring change. Logs: `docs/checks/readability-webm-{check,browser}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Manual inventory updated; acceptance unrun.
Known issues: Embeds post-process/webview, remaining README/manual inventory and
readability completion checks; remaining Phase 4 plugins, Claude's Phase 5 gate
and Phases 6–8 as specified above.

### Readability pass progress — Embeds lifecycle, 2026-10-08

Delivered: EmbedPass owns placeholder restoration, resource resolution, per-kind
image/media/note rendering and nested-pass disposal. It receives only its render,
resource and opening capabilities; plugin apply names renderer/content/command
registrations. README lists actual files/services/limits and manual regressions.
Backlog exhausted: 2 → 0 distinct files, long-function 2 → 0; all other lists
already empty. Deleted eslint.legacy.mjs and its config block. No rule limits
changed, no new inline disables or intentional behavior fixes.
Checks: `pnpm check` 352/352; `pnpm test:browser` 14/14. Native not rerun for
this webview-only unit; completion check follows. Logs:
`docs/checks/readability-embeds-{check,browser}.txt`.
Ledger: 87/16/2/333/10. Deviations: none. Owner acceptance unrun.
Known issues: finish the remaining README template audit (autoPair, dialect,
folding, indentGuides, lineNumbers, smartLists, spellcheck), manual inventory and
ordered readability completion checks/record. Then remaining Phase 4 plugins,
Claude's Phase 5 completion gate and Phases 6–8 as specified above.

### Readability pass progress — Remaining plugin READMEs, 2026-10-08

Delivered: rewrote autoPair, dialect, folding, indentGuides, lineNumbers,
smartLists and spellcheck READMEs from the live implementations. Each now names
user behavior, flow, files, services/events/settings and limits. Removed stale
Phase 3 status and generic claims of commands where none exist. Reviewed the
other built-in READMEs, including Claude's new Phase 5 documentation; his files
remain untouched. Added the remaining manual regression inventory.
Checks: `pnpm check` 352/352; log `docs/checks/readability-readmes-check.txt`.
Smoke suites deferred to the immediate readability completion checks; docs only.
Ledger: 87/16/2/333/10. No new code, exceptions or behavior changes.
Known issues: run the ordered readability completion checks and write the final
before/after record, then continue remaining Phase 4 plugins. Claude's Phase 5
completion gate and Phases 6–8 remain as specified above. Manual acceptance unrun.

### Readability pass — 2026-10-08

**Completed against the plan's automated acceptance criteria.** Owner hands-on
acceptance remains Phase 9 and is not claimed.

Delivered: exhausted the original 86-file backlog with responsibility-based
rewrites, preserving behavior; removed eslint.legacy.mjs and its config block.
All current source is checked under the unchanged limits. Plugin READMEs follow
the required behavior/flow/files/contracts/limits structure, stale project-status
prose is removed, kernel lifetime/proxy invariants are explained, and the manual
plan includes regressions for rewritten plugins. Earlier progress records cover
Tables, Properties, Page Preview, native Workbench, Editor, Footnotes, kernel,
HTML rendering, Commands and Document.

This run completed the 38 files outstanding at its start:
- host/navigation; markdown/metadata/index; markdown/properties edits, merge,
  order, scalar-edits; markdown/search canvas, query; markdown/tables/model;
- plugins/callouts/webview; codeBlocks code-highlight, code-selection, code-source,
  webview; diagrams/webview; embeds image-dialog, image, post-process, webm, webview;
- formatting inline, lines, webview; links host, webview; livePreview inline,
  rendered-position, webview; math commands, webview; render/webview;
  resources/host; tasks/webview; vim/webview;
- shared/fuzzy; shared/rpc/endpoint; webview/features; webview/ui/menu.
New collaborators are named and documented in the unit records/READMEs. The
original baseline list remains auditable in commit 21ac0e6; all 86 paths are
covered by this record and the preceding readability records.

Backlog before → after: 86 → 0 distinct files; max-lines-per-function 66 → 0;
complexity 33 → 0; max-params 13 → 0; nested-ternary 19 → 0; depth 1 → 0;
receiver-pattern 6 → 0. During this run 38 → 0 distinct files. A final audit
removed stale compact-array exemptions missed by line-based edits, as recorded
in WebM. No added inline eslint-disable directives; no raised limits or added
legacy files. No behavioral bugs were intentionally fixed in this pass.

Unit tests before → after: 215 → 352 overall. Readability added 59 units across
runs (32 before this run, 27 here); Claude's concurrent Phase 5 part-one merge
added 78. Existing assertions and the smoke suites were not weakened or expanded.
Final checks, in order: `pnpm check` **352/352**, formatting/lint/all TypeScript
projects/contributions passed; `pnpm test:browser` **14/14**;
`pnpm test:vscode` **1/1**, freshly packaged VSIX in the isolated /tmp profile.
Logs: `docs/checks/readability-complete-{check,browser,native}.txt`.
Ledger: **87 ported / 16 rewritten / 2 changed / 333 retired / 10 todo**, 448 total.
The ledger change came from Claude's Phase 5 root-discovery unit. No source
scenario was dropped or newly retired in this readability run.

Deviations: none. Native navigation adapts its existing typed argument tuple to
named internal options to preserve the interface used by the concurrent vault
work. No push, publication, owner-profile installation or source-worktree edits.

Known issues / next work:
- Phase 4: inlineTitle rename/focus/per-panel view transfer; tags; suggest
  sources/channels; search query worker/cancellation; pasteHtml including cells;
  copyForAgent; markers. Each needs manifest, composition/lifecycle units, README,
  contributions, ledger and manual coverage. None was delivered by this pass.
- Phase 5 part one is on main, but no "Phase 5 (completed)" record exists.
  Claude owns remaining consumer integration, Tags view and unresolved styling.
  Keep VaultIndex unchanged and do not start Phase 6 until that gate is met.
- Phases 6–8: command/settings/parity, public API and packaging/handover as planned.
- Owner should first rerun table drag/scroll/cell projection and Properties drafts/
  IME, then two-panel undo/state, plugin toggles and embed/media cleanup.

### Phase 4 progress — Inline title, 2026-10-08

Delivered: default-on title widget in both presentation modes, controlled drafts,
IME/blur/Enter/Tab/Escape behavior, Properties/body focus via typed events and
validated rename/focus RPC. Native rename rechecks same-folder/local-file targets
and uses one WorkspaceEdit. The host flushes/captures all sibling panels, rejects
stale or cancelled requests, retains transfers by original panel ID and reopens
groups active-last. Initialized webviews restore independent selection, scroll,
mode and plugin contributions; handlers follow resource enablement and disposal.
Added composition coverage through the catalog and eight title/schema/rename/host
units; ported three remaining source protocol/transfer ledger cases.

Checks in order: `pnpm check` **361/361**, formatting/lint/types/contributions;
`pnpm test:browser` **14/14**; `pnpm test:vscode` **1/1**, freshly packaged isolated
/tmp profile. Logs: `docs/checks/phase4-inline-title-{check,browser,native}.txt`.
Smoke suites unchanged. Ledger: **87/19/2/333/7**, total 448.
README and manual scenarios added, including two-pane rename and IME; not run.

Deviations: the root host half owns resource-enabled handlers so transfers survive
panel recreation. A validated editor `initialized` notification emits typed
`editor/ready`; this avoids sending restores before feature registration. Property
focus is a bail event rather than cross-plugin DOM access. Source initialization's
focus intent is represented by explicit plugin focus/transfer schemas. No lint
exceptions, source-repository edits, publication or owner-profile installation.

Known issues: remaining Phase 4 tags, suggest, search, pasteHtml (including table
cells), copyForAgent and markers; each needs composition/lifecycle/unit/manual
coverage. Claude's Phase 5 is still incomplete and owns consumer integration,
Tags view and unresolved styling; do not start Phase 6 until its completion
record is on main. Phases 6–8 remain as planned. Native smoke proves boot/edit/
save/undo, not hands-on rename correctness; owner should test split-pane title
rename and Properties focus first for this plugin.

### Core fix — Panel vault service bridge, 2026-10-08

Found while wiring Phase 4 tag search: editor panels create isolated runtimes,
but the shared root `vaults` registry was never provided to them. Consequently
panel `vault` and its dependent host features stayed pending after the Phase 5
part-one merge. Editor now optionally injects the registry and provides that
same instance before panel feature configuration. RPC runtimes stay independent.
Added a unit proving two distinct panel kernels share the registry. Claude's
index implementation, worktree, branch and VaultIndex interface are unchanged.
This is a separately committed core wiring bug fix, not a readability rewrite
or a claim to complete any Phase 5 deliverable.
Checks in order: `pnpm check` 362/362; `pnpm test:browser` 14/14;
`pnpm test:vscode` 1/1, isolated fresh VSIX. Logs:
`docs/checks/panel-vault-bridge-{check,browser,native}.txt`.
Ledger unchanged: 87/19/2/333/7. No lint exceptions. Manual acceptance unrun.
Known issues: continue Phase 4 tags/suggest/search/pasteHtml/copyForAgent/markers;
Claude's Phase 5 completion gate still precedes Phases 6–8.

### Phase 4 progress — Tags, 2026-10-08

Delivered: inline tag widgets, rendered/shared-placeholder click handling and
validated tag search RPC. Host results use VaultIndex metadata (YAML, inline and
footnote tags), case-insensitive descendant matching, excluded-file filtering and
fuzzy quick-pick queries; opening uses the contained native navigation adapter.
Listeners/widgets/RPC dispose with the feature. Added indexed-search and host
lifecycle units, catalog composition coverage, README and manual scenarios.
The original tag RPC assertions now target the new schema.
Checks in order: `pnpm check` **365/365**; `pnpm test:browser` **14/14**;
`pnpm test:vscode` **1/1**, isolated fresh VSIX. Logs:
`docs/checks/phase4-tags-{check,browser,native}.txt`.
Ledger: **87/20/2/333/6**, total 448. No smoke expansion or lint exceptions.
Deviations: native quick pick instead of an in-editor results pane; indexed
metadata replaces the source's filesystem scan as designed. The hierarchical
Tags view remains Claude's Phase 5 work; its interface was not changed.
Known issues: Phase 4 suggest, search, pasteHtml (including cells), copyForAgent
and markers remain. Phase 5 completion must be on main before Phase 6; Phases 6–8
remain as planned. Owner tag/native interaction acceptance has not run.

### Phase 4 progress — Suggestions, 2026-10-08

Delivered: default-on completion framework, caller-owned trigger service/event,
Links and Tags sources, fuzzy-ranked indexed files/aliases/unresolved texts,
headings, explicit local/global blocks and case-merged tags. Requests/results are
bounded and validated, source switches are checked by the host, excluded files
are omitted, code/frontmatter is suppressed, bracket pairs are reused and
pending requests cancel on abort/disposal. Keys use the suggestion slot.
Six focused units cover triggers, insertion, literal-code suppression, indexed
candidates, schemas and host lifecycle; catalog composition now compares source
trigger outcomes across enablement histories. README/manual/ledger updated.

Checks in order: `pnpm check` **376/376**; browser smoke **14/14**; native smoke
**1/1**, freshly packaged isolated /tmp profile. Logs:
`docs/checks/phase4-suggest-{check,browser,native}.txt`. Existing suites unchanged.
Ledger remains **87/20/2/333/6**, total 448. No lint exceptions.
Deviations: built-in sources use the typed bail event directly to avoid optional
service dependency restarts; third-party sources can use caller-bound
`suggest.register`. Explicit block IDs only; arbitrary paragraphs do not acquire
new IDs on suggestion acceptance. No filesystem scan per request.
Known issues: Phase 4 search, pasteHtml (including table cells), copyForAgent and
markers remain. Claude's Phase 5 completion record must be on main before Phase 6;
Phases 6–8 remain as planned. Owner should test popup focus/IME, closing-bracket
reuse, alias/block navigation and toggles with table/Vim keys first. Manual
acceptance has not run.

### Phase 4 progress — Search query blocks, 2026-10-08

Delivered: query-specific block/fence renderers, accessible status/results and
refresh, cancellable subscriptions and index-triggered refresh. The host lists
VaultIndex files, excludes configured files and reads live unsaved text through
Vaults; no per-query workspace scan. Each query gets an isolated worker with
validated startup/submission/reply schemas, startup/evaluation deadlines and
termination on cancel or disable. Per-document errors are counted without losing
other results; fatal query/worker errors surface in the block. Source identity is
checked against the host-owned index and result paths are encoded relative links.

Ported four worker units and rewrote two client/protocol units; added indexed
eligibility/live-read and host disable/re-enable tests. Generic lifecycle and
composition tests include search and query-versus-code renderer precedence.
README/manual scenarios and all six remaining ledger rows updated.
Checks: `pnpm check` **385/385**, formatting/lint/types/contributions; browser smoke
**14/14**; native smoke **1/1**, freshly packaged isolated /tmp profile. Logs:
`docs/checks/phase4-search-{check,browser,native}.txt`. Smoke suites unchanged.
Ledger: **91 ported / 22 rewritten / 2 changed / 333 retired / 0 todo**, total 448.
Deviations: namespaced RPC cancellation replaces source ad-hoc search IDs; the
native adapter supplies only the packaged worker path. No lint exceptions or
new test dependency. Pathological regex testing is a bounded unit, not a fuzzer.
Known issues: Phase 4 pasteHtml (including cells), copyForAgent and markers remain;
Claude owns Phase 5, and its completion record on main still gates Phase 6.
Phases 6–8 remain. Manual query/embedded-link/refresh acceptance is unrun; owner
should test nested-folder result links, live unsaved edits, query errors and
source exposure while a query is loading first.
### Phase 5 (completed) — Vault index and host features (Claude), 2026-10-08

**Completed against the plan's automated acceptance criteria.** Part 1 (vault
index, Backlinks, Outgoing Links, Markdown Outline, Quick Switcher, Word Count,
Link Updates, `scripts/measure-vault.ts`) is recorded above. Owner hands-on
acceptance is not claimed.
Delivered in part 2:
- Unresolved-link styling in `links`: the panel host answers the webview's
  first request with the note's `unresolvedLinks`, then sends the set again
  after each re-resolution that changed it (`VaultIndex.onDidResolve`). Rendered
  wikilinks in the set get `is-unresolved` (dimmed, dotted underline).
- Tags view: the window half of `tags` (`src/plugins/tags/view.ts`), built with
  the ported tag tree from indexed metadata; case variants merge, counts are
  notes, excluded files are left out as in tag search. A click picks a note
  with the tag through the search the panel host uses (`pickTaggedNote`).
  Follows `plugins.tags.enabled` with the editor half; new settings
  `tags.viewSort` (name|frequency) and `tags.viewNested`.
- Consumers on the index: `resources` resolves through `vault.resolveLink`;
  `tags` search and `suggest` (Codex, Phase 4) read `VaultIndex` metadata,
  aliases and unresolved links; `search` (Codex, Phase 4) lists notes with
  `vault.files()` and reads text with `vaults.text()`.
  `test/unit/vault/no-scans.test.ts` fails if any source other than
  `src/host/vault-system.ts` lists folders. The stub was deleted in part 1.
- `test/unit/editor/bootstrap.test.ts` boots the real host wiring with an
  in-memory vault and fails if any window or panel plugin does not start. It
  fails on 852bf53, where part 1 left the panel `vault` service (and so
  `links`, `resources` and `properties`) pending until Codex's fix c7d29a1.
- Fuzzy scoring (`src/shared/fuzzy.ts`) is about 20 times faster with the same
  results: one `Intl.Segmenter`, no segmentation for printable-ASCII text, and
  the last query's tokens reused.
Checks in order, after rebasing on Codex's search (d022d8b): `pnpm check`
**390/390** (format, lint, all TypeScript
projects, contributions); `pnpm test:browser` **14/14**; `pnpm test:vscode`
**1/1**, freshly built, isolated /tmp profile. Logs:
`docs/checks/phase5-complete-{check,browser,native}.txt`.
Measurements, 10,000 generated notes on Apple Silicon. Indexing (part 1): cold
5.1–5.7 s with the longest host block 19–23 ms; warm start about 1.0 s with a
17 ms block. Per keystroke on the extension host, before → after the scorer
change: Quick Switcher 292 → 24 ms; `[[` link suggest with a query
389 → 28 ms, empty 46 → 41 ms; heading suggest across notes 194 → 61 ms;
block suggest 234 → 92 ms; tag suggest 8 → 6 ms.
Ledger: **91/22/2/333/0**, total 448, after Codex's search port. The ported
tag-tree test now also covers the Tags view.
Deviations from DESIGN.md:
- The links host follows `VaultIndex.onDidResolve`, not the `vault/resolved`
  event: panel kernels do not receive window events (DESIGN §13 links entry
  updated).
- The Tags view counts notes (the ported tag tree's tested behaviour), not tag
  occurrences.
- The tags webview half now has `reconfigure() { return true }`: the new
  settings only shape the window view, and the catalog test requires features
  to accept configuration changes in place.
Known issues:
- Suggest rebuilds its candidates across all notes on each keystroke; heading
  and block suggestions across notes take 61–92 ms on 10,000 notes. Codex, as
  `suggest` owner: cache candidates per index change (`onDidChange`), compute
  `linkText` only for the shown 50, and run `pnpm exec tsx` on a generated
  vault like `scripts/measure-vault.ts` to confirm under 16 ms.
- The indexing host block is still slightly above the 16 ms budget on 10,000
  notes (part 1).
- When the catalog configuration test in `test/unit/features/lifecycle.test.ts`
  failed (once, while adding the tags settings), the file ran for about five
  minutes before failing instead of failing at once. Cause not investigated.
- Plugin-local `*.test.ts` files are not type-checked (part 1).
- Manual acceptance not run: Phase 5 section of docs/MANUAL_TEST_PLAN.md,
  including the new unresolved-link and Tags view scenarios.
Phase 5 is complete: after Phase 4, Codex may start Phase 6.

### Phase 4 progress — HTML paste, 2026-10-08

Delivered: default-on HTML conversion with sanitizer, awaited typed
`paste/transform` pipeline and focused CodeMirror routing, including projected
table cells. Plain-text shortcuts, code and property inputs bypass conversion;
rectangular table paste keeps TSV behavior. Delayed transforms cannot overwrite
changed text/selections or closed views. Conversion preserves literal escaping,
formatting, tasks, tables, wiki aliases/embeds, TeX and callouts using the existing
Turndown dependency plus domain rules. Table clipboard now respects an already
handled event. Added five conversion/stale-paste/code-context units and catalog
lifecycle/composition coverage. README, manual plan and ledger notes updated.

Checks: `pnpm check` **396/396**, formatting/lint/types/contributions;
`pnpm test:browser` **14/14**. Logs:
`docs/checks/phase4-paste-html-{check,browser}.txt`. No native wiring changed;
native smoke not repeated for this unit. No smoke expansion or lint exceptions.
Ledger remains **91/22/2/333/0**, total 448.
Deviations: existing Turndown rules replace the source's handwritten generic DOM
walker; domain-specific conversions remain explicit. Rich paste does not download
attachments; menu paste and rectangular table ranges retain plain-text behavior.
Known issues: Phase 4 copyForAgent and markers remain. Claude's dated
"Phase 5 (completed)" record is now on main (c5b5a7a); after Phase 4, proceed to
Phases 6–8. Suggestion candidate caching/measurement remains in our ownership as
reported by Claude. Owner should test rich paste into an active cell, undo,
Shift+Mod+V and plugin toggles first; manual acceptance is unrun.

### Phase 4 progress — Copy for Agent, 2026-10-08

Delivered: command/palette, selection-only title action, editor/table selection
menus and Mod+Alt+C (including focused cells/grid). Root host service owns
resource-enabled validated handlers. Core `selections` captures flushed,
version-checked, host-held frozen snapshots, rejects invented text/foreign objects,
and maps wire positions to original CRLF offsets. Copy uses the LLM Wiki wording,
workspace-relative paths in one local root and full URIs otherwise. Dirty notes
offer Save and Copy / Copy Text Only / Cancel; saving recaptures selection, while
noninteractive service calls reject dirty documents. No chat handoff is performed.

Five focused units cover CRLF/column-zero lines, forged/stale snapshots, path
policy, dirty choices and handler disposal/re-enable. Catalog lifecycle includes
command/menu ownership. Manifest-driven menu generation and active-panel selection
context support the title action. README/manual/ledger updated.
Checks in order: `pnpm check` **402/402**; browser smoke **14/14**; native smoke
**1/1**, freshly packaged isolated /tmp profile. Logs:
`docs/checks/phase4-copy-agent-{check,browser,native}.txt`. Smoke suites unchanged.
Ledger **91/22/2/333/0**, total 448. No lint exceptions.
Deviations: reusable host selection snapshots belong to core `editor`, ahead of
the API facade; `editor/selectionMenu` is an awaited shared menu pipeline.
Snapshots use original source offsets/native document versions; the internal
capture wire still uses normalized offsets/collaboration versions. Untitled
notes must be saved/reopened before a disk reference is available; text-only copy
is supported. Native plain-text editor selections are outside this plugin's scope.
Known issues: Phase 4 markers remains. Phase 5 is completed on main; then continue
Phases 6–8, including suggestion caching/measurement from its record. Manual
acceptance remains unrun; owner should test table selection references, dirty
choices, CRLF and switching two panels before command completion first.

### Phase 4 progress — Source markers, 2026-10-08

Delivered: core marker service, caller-owned atomic sets/actions, per-panel
validated snapshots and activation RPC, plain-text badges and Live Preview
replacement-aware placement. Exact native source edits (including CRLF and
separated edits) now accompany `document/changed`; history remaps old-version
sets and drops deleted ranges. The webview maps wire history and pending local
updates without double-counting acknowledgements. Snapshot revisions prevent
late initial replies from replacing newer sets. Provider disposal clears only its
markers/actions and revokes retained service handles. Bootstrap marks supported
root services replaceable; no Query folder watcher is included.

Seven new units cover source/wire mapping, deletion/anchors, two panels, owner
isolation and revocation, atomic limits, core composition/disposal/re-enable and
replacement-versus-source placement. README/manual/ledger notes updated.
Checks in order: `pnpm check` **409/409**; browser smoke **14/14**; native smoke
**1/1**, freshly packaged isolated /tmp profile. Logs:
`docs/checks/phase4-markers-{check,browser,native}.txt`. Smoke suites unchanged.
Ledger **91/22/2/333/0**, total 448. No lint exceptions.
Deviations: source history retains 128 native revisions, wire history 512 changes;
unknown old versions are rejected instead of guessed. Public markers use native
source coordinates/versions, while transport converts to normalized positions.
`livePreview.visiblePosition` exposes placement without cross-plugin imports.
Known issues: review Phase 4's indexed-search predicate fast path before the
phase-completing commit; suggestion candidate caching/measurement also remains
from Claude's Phase 5 record. Then Phases 6–8. Manual marker interactions and
provider replacement remain unrun; owner should test badges inside rendered
blocks, two providers/panels, exact disjoint edits and pending local edits first.

### Phase 4 follow-up — Indexed search predicates, 2026-10-08

Closed the DESIGN §13 fast-path gap: a conservative scope-aware query plan tells
the worker/host whether content and metadata are needed. File/path predicates
avoid reads, and tag/property predicates use indexed metadata when available;
missing metadata falls back to a live read. Content queries parse one coherent
current text snapshot rather than mixing it with older metadata. New planning,
read-avoidance and real-worker transport tests preserve nested-scope semantics.
No VaultIndex interface or Claude-owned implementation was changed.
Checks in order: `pnpm check` **411/411**; browser smoke **14/14**; native smoke
**1/1**, freshly packaged isolated /tmp profile. Logs:
`docs/checks/phase4-indexed-search-{check,browser,native}.txt`.
Ledger unchanged, **91/22/2/333/0**, total 448. No lint exceptions or smoke changes.
Deviations: mixed content queries conservatively read content; metadata-only
queries use the index. Read failures keep the existing unreadable-file count.
Known issues: suggestion candidate caching/measurement from Phase 5, then Phase 4
completion checks and Phases 6–8. Manual acceptance remains owner-run.

### Phase 4 follow-up — Suggestion candidate caching, 2026-10-08

Addressed Claude's Phase 5 consumer finding in our suggestion plugin. Candidate
groups invalidate on index changes/resolution; unchanged files retain prepared
ranking text. Bounded best-50 selection avoids sorting the whole vault, and
`vault.linkText` runs only for displayed entries. Prepared scores retain the
existing fuzzy formula, including CJK and grapheme normalization; single-token
substring scoring avoids building unused highlight ranges. Added score-parity
and cache-invalidation/materialization-count units.

`pnpm exec tsx scripts/measure-suggestions.ts` generates 10,000 in-memory notes
(four headings, one block and one alias each). Warm median/p95 milliseconds:
link "Note" 1.68/2.55; multi-token link 12.37/13.46; empty link 0.43/0.58;
global headings 4.19/5.98; global blocks 1.27/1.64; tags under 0.01. Each query
after one changed file measured 1.39–12.69 ms. Cold candidate construction still
reached 28.87 ms, above the frame budget; full first-open performance remains
Phase 9 measurement work. Log: `docs/checks/phase4-suggest-cache-measure.txt`.
Checks: `pnpm check` **413/413**, formatting/lint/types/contributions. Final smoke
results follow in the Phase 4 completion record. Ledger unchanged **91/22/2/333/0**.
Deviations: exact score/label ties use canonical file paths, allowing link text to
be deferred to displayed entries. No VaultIndex interface changes, lint exceptions
or smoke expansion. No owner data is used by the measurement script.
Known issues: run Phase 4 completion checks/record, then Phases 6–8. Cold suggestion
construction and Phase 5 indexing's 19–23 ms host block remain performance limits;
owner manual acceptance has not run.

### Phase 4 (completed) — Editor feature plugins, 2026-10-08

Delivered: completed the readability gate and the remaining Phase 4 plugins:
inlineTitle (rename/focus/per-panel transfers), tags (render/search), suggest
(link/alias/unresolved/heading/block/tag sources), search (cancellable worker,
query blocks and indexed predicates), pasteHtml (including focused table cells),
copyForAgent (validated selection/reference/dirty choices) and markers (owned
badges/actions and source/wire mapping). Earlier Phase 4 feature records remain
part of this delivery. Every feature is catalog-composed; core markers has a
composition/disposal test. Manifests, READMEs, unit coverage, ledger disposition
and manual scenarios are present. Source repositories and owner profiles remain
untouched. Claude's Phase 5 completion record is on main, so Phase 6 may begin.

Checks in order: `pnpm check` **413/413** (format, lint, all TypeScript
projects, contributions); `pnpm test:browser` **14/14**; `pnpm test:vscode`
**1/1**, freshly packaged isolated /tmp profile. Logs:
`docs/checks/phase4-complete-{check,browser,native}.txt`.
Ledger: **91/22/2/333/0**, total 448; retained smoke rows are ported/rewritten, in
accordance with the owner's testing instruction. No suites were expanded.
Deviations from DESIGN.md: recorded per unit above. Native tag quick pick; typed
suggestion trigger event avoids dependency restarts; explicit existing block IDs
only; generic Turndown rules plus domain conversion; bounded marker history;
untitled notes require save/reopen for disk references. No new lint exceptions.
Known issues: Phase 6 commands/settings/parity inventory, Phase 7 public API and
Phase 8 packaging/handover remain. Cold suggestion construction reaches 29 ms;
Phase 5 indexing reported 19–23 ms host blocks (full performance acceptance is
Phase 9). Manual acceptance is not claimed. Owner should first test table
projection/undo, two-panel title rename, rich cell paste, dirty Copy for Agent,
then marker/provider lifecycle and query cancellation with the API sample.

### Phase 6 (completed) — Commands, settings and parity inventory, 2026-10-08

Delivered: audited/routed all 60 commands and declared all 53 settings. Added
readable line length, strict rendered line breaks, RTL and schema-owned default
mode; settings reconfigure without replacing document/selection. Links owns the
file-location schemas through public setting aliases, and native note creation
uses them. `links.useWikilinks` now controls suggestion acceptance, with encoded
Markdown destinations and replacement of the whole partial wiki token. Static
formatting/Copy for Agent actions use native webview context menus; Add File
Property joins Copy for Agent and Open as Text in the title. The internal Vim
shortcut consumer is hidden from the palette; pinned-source bindings are retained,
and all verify keys remain unbound.

The manual inventory names every generated command/setting; `docs/PARITY.md`
contains 243 rows, all "not observed". The updater preserves existing owner
observations. TypeScript now checks plugin-local unit files too; corrected one
fake's new settings field and one callback's void return, without weakening any
assertion. The browser fixture only gained schema-default settings fields; the
smoke suites remain 14 browser and 1 native test.
Checks in order: `pnpm check` **421/421** (format/lint/all TypeScript projects,
including plugin-local tests/contributions); browser smoke **14/14**; native
smoke **1/1**, freshly packaged isolated /tmp profile. Logs:
`docs/checks/phase6-complete-{check,browser,native}.txt`.
Ledger **91/22/2/333/0**, total 448 (446 source scenarios plus 2 adapter cases).
Deviations from DESIGN.md: attachment-folder is validated policy only; importing
attachments is not supplied by HTML paste. Strict line breaks applies to rendered
Markdown, not source line structure. Explicit Insert Wikilink keeps wiki syntax;
unresolved Markdown-style suggestions follow normal Markdown opening and do not
create missing files on click. No new lint exceptions or smoke cases.
Known issues: Phase 7 public API/external contributions and Phase 8 packaging/docs
remain. Manual parity is unobserved; cold suggestion/indexing frame-budget limits
remain as recorded. Owner should test resource-scoped settings, native menus,
Vim host collisions and wiki/Markdown suggestion acceptance first.

### Phase 7 — Host-owned actions and code processors, 2026-10-08

Delivered: core editor action registry, native title/selection pickers and contextual
selection labels; callbacks remain in the host with owner cleanup and authentic
selection capture. Code-block processors have caller ownership, duplicate-language
checks, validated data-only RPC, trusted-workspace and source-containment checks,
generation-aware caching, cancellation and late-result rejection. Returned output
uses the normal sanitized renderer; generated tasks are read-only, including nested
embeds. Composition tests cover the updated codeBlocks feature. The manual/parity
inventory updater appends new entries without replacing owner observations.

Checks in order: `pnpm check` **429/429**; existing browser smoke **14/14**;
existing native smoke **1/1**, freshly packaged in an isolated /tmp profile.
Logs: `docs/checks/phase7-contributions-{check,browser,native}.txt`.
Ledger remains **91 ported / 22 rewritten / 2 changed / 333 retired / 0 todo**.

Deviations: contributed title and selection actions use native quick pickers (plus
contextual widget selection menus), avoiding injected webview code. Processor cache
keys also include source URI, line hint and registry generation to prevent reuse
across contexts; sourceLine is an advisory render-context hint, not edit authority.
Generated output is read-only and recursion is limited to eight render ancestors.
No lint exceptions or smoke cases were added.

Known issues: Phase 7 is incomplete. Still required: frozen activation API and
public declarations, isolated external plugin manager and scoped settings, actual
plugin state reporting/events, API-wide unit coverage, API.md and complete sample
plugin. Phase 8 packaging/notices/documentation/handover remains. Owner should test
external action menus and slow/recursive/sanitized processor output after the API
sample is available; earlier manual parity and performance limits remain open.

### Claude audit and fixes, 2026-10-08

Reviewed all 16 commits after 0a2fe64 through 74a6507. Claude added the
feature-specific fixture vault (9a56c91), fixed initial editor registration
(5507fb6) and outline startup (33b4a22), and made Backlinks/Outgoing Links
default off (f9bd92d). The CSS restoration (cfac610) supplies plain bundled
styles with #app specificity, callout icons, heading-aligned line numbers and
title actions. WebM CSP (c15ae2b), indented code (f0efe7f), adjacent footnotes
(53948c1), arbitrary task statuses (ef68330), escaped table pipes (cc91674),
bare URL links (8e91790), error formatting/visible render errors (e587648),
and Copy for Agent formatting (ae615ca) have regression coverage. Kernel
cleanup (057ea39) releases ended effects/fibers; 38839c6 locks readability
limits and reviewed lint exceptions; 74a6507 consolidates Workbench and removes
dead canvas geometry. These are their committed changes, not a claim of owner
visual acceptance.

### Phase 7 — Public API facade and external plugins, 2026-10-08

Committed the restored API with Claude's corrections: frozen API v1, documented
public types, authentic/stale selection checks, per-panel snapshots and states,
resource-scoped plugin overrides, isolated external services and revocation of
retained contexts. Document events cover open Markdown Workbench notes only.
Public declarations import only vscode and one another. All 10 API units pass.

Checks: `pnpm check` **453/453**, including format/lint/types/contributions;
existing browser smoke **14/14**; existing native smoke **1/1**, freshly packaged
and installed in an isolated /tmp profile. No lint exceptions or smoke expansion.
Ledger remains **91/22/2/333/0** (448 rows). Phase 7 documentation/completion and
Phase 8 remain, along with the audit's logging and management-command gaps.
Manual acceptance is unrun.

### Phase 7 (completed) — API documentation and sample external plugin, 2026-10-09

Closed the audit's missing requirements first: §5.7 logging (one
`Markdown Workbench` log output channel, webview records forwarded over the
editor protocol, `markdownWorkbench.debug.logging` gates debug lines on both
sides), §6.5 `Manage Plugins` and `Show Plugin Status` (failed and pending
plugins listed first; selecting one opens its settings), and §25.2 `Use
Markdown Workbench for Markdown in This Workspace` (writes the workspace
`workbench.editorAssociations` entry, keeps other associations). The Linux
browser redo smoke now presses `ControlOrMeta+Shift+Z`; it failed on main for
the same reason. Each requirement has unit tests.

`API.md` documents every v1 member, the external-plugin rules, markers,
actions, code block processors, the error table and a complete example.
`test/fixtures/sample-plugin` is that example as a real extension: it sets
`TODO` markers with a describe action, claims `ticket:` links over
`links/open`, renders `tickets` code blocks and contributes a command; `pnpm
sample` builds it. `sample-plugin.test.ts` runs it against the real facade;
`declarations.test.ts` emits `dist/api` and type-checks a consumer against it.

Fix: the render sanitizer dropped `obsidian:` and other custom-scheme links;
`sanitizer-options.ts` now allows unknown protocols (the link plugin still
decides what opens) with its own unit test.

Checks: `pnpm check` **472/472**; browser smoke **14/14**; native smoke **1/1**.
No lint exceptions; eslint now ignores build output and `.vscode-test`.
Ledger unchanged **91/22/2/333/0**. Phase 8 remains.

### Phase 8 — Packaging, documentation and hand-over, 2026-10-09

`pnpm package` builds a 3.2 MB VSIX (84 files) from an allowlist
`.vscodeignore` and checks `THIRD_PARTY_NOTICES.md`, which
`scripts/third-party-notices.mjs` generates from the packages esbuild
actually bundled. The native smoke ran once against that VSIX
(`MARKDOWN_WORKBENCH_TEST_VSIX`, isolated /tmp profile, own xvfb display):
**1/1**.

README, CAPABILITIES.md (every plugin, default and difference from
Obsidian) and CHANGELOG.md are new or rewritten; API.md and the sample
plugin came with Phase 7. `docs/MANUAL_TEST_PLAN.md` is rewritten by plugin
against the fixture vault, with no phase status sections, and starts with
installing the VSIX and the sample plugin into an isolated profile. The
generated command and setting inventory is kept. DESIGN §13 and §19,
PARITY.md and the plugin READMEs were corrected (Backlinks/Outgoing Links
off by default, CSP `connect-src`, CSS files instead of removed style
objects).

Fixes from a side-by-side with Obsidian on the fixture vault, each with a
unit test: setext underlines stay visible, nested quotes draw a bar per
level, checked tasks are muted and struck through in Live Preview (any
status but a space, with `data-task` for snippets), and rendered blocks get
line numbers. The fixture's claim that comments hide in Live Preview was
wrong: Obsidian shows them faint, as the workbench does.

Checks: `pnpm check` **483/483**; browser smoke **14/14**; native smoke
**1/1** against the packaged VSIX. Ledger **91/22/2/333/0**, no `todo`
rows (`scripts/test-ledger.mjs` needs the unavailable source checkout, so
the ledger was not regenerated). Manual acceptance (Phase 9) is unrun.

### Review fixes, round 1 — 2026-10-09

From the external review of PR #1 (`/workspace/plans/chatgpt-pr-review.md`,
findings A1–C4). Markdown Workbench and Agent PDF Viewer stay separate
extensions (owner decision), so merge-only items were done only where they
improve this extension on its own.

- Kernel: plugin activation is transactional (a failed `apply` releases
  everything it acquired, in reverse order) and teardown mirrors activation
  (services withdrawn and consumers stopped first, then effects and
  children LIFO). `ResourceLedger` records every held resource; invariants
  in `src/kernel/README.md`.
- Plugin precedence (`plugin-order.ts`) is separate from the dependency
  graph (`plugin-graph.ts`, derived from each plugin's `inject`).
- Every host plugin is started and stopped against tracking fakes and must
  leave nothing registered (`test/unit/features/leave-no-trace.test.ts`).
- Manifests declare capabilities; names are plugin `agentBridge`, service
  `AgentHandoff`, command `copyLinkForAgent` (setting
  `markdownWorkbench.plugins.agentBridge.enabled`, renamed with no
  migration because nothing was published).
- The handoff text is specified in `docs/agent-handoff-format.md`, kept
  byte-identical with Agent PDF Viewer and pinned by a test.
- RPC coalesces state notifications into versioned batches; Live Preview
  re-indexes and redecorates only invalidated blocks
  (`RenderInvalidation`), checked against full rebuilds by a randomised
  test.
- The editor is described by an `EditorProvider`; the VS Code panel code
  (`src/host/editor-panels.ts`) is generic and split from `workbench.ts`.
- ESLint rejects floating and misused promises in `src`.

Not done here: an editor-session runtime for several editor kinds, the
PDF subtree import and merged-bundle splitting (merge-only; the webview
already lazy-loads Mermaid, MathJax and code highlighting), and
`exactOptionalPropertyTypes` (129 errors in about 60 files, deferred).

### Load-time follow-up — 2026-10-10

Targeted the recorded 16,000-block open profile: lazy cached heading-fold queries
replace gutter-triggered full metadata extraction; Live Preview caches structural
discovery across renderer registrations and skips unrelated predicates; Prism
loads requested language components in dependency order, preserving extensions,
aliases and embedded syntax. Added unit regressions and reproducible Node state
and Prism diagnostics. The kernel and plugin startup order are unchanged.

Measurements, raw samples, validation and remaining owner re-measurements are in
`docs/perf/after-notes.md`. Chromium aborts under this sandbox's permissions, so
no browser after timing or native `after.json` is claimed. Changes stay in the
working tree at the owner's request; no commit, push or branch command was run.

Checks: formatting, `pnpm lint`, `pnpm typecheck` and `pnpm build` passed.
Fallback unit runner: 170/171 files passed; the platform-layer unit's subprocess
capture is blocked by `EPERM`, while its three compiler fixtures reject the
forbidden APIs when run directly. Existing browser suite: 47 launch failures
from Chromium's sandbox abort, so browser acceptance remains unverified.

### Vim caret follow-up — 2026-10-10

Delivered: a small pure caret-settings/mode mapper, native cursor fields through
the existing `nativeConfigKeys` path, and one measured presentation layer shared
by note and Vim table-cell editors. Normal/visual use a full character block with
readable text in VS Code's cursor background colour; insert uses the native line
width; `R` (insert + overwrite) and pending/counting `r` use an underline.
Vim decides shape independently of native cursorStyle. Native typing supports all
six styles, five blink settings and off/explicit/on movement animation. Selection
backgrounds remain `drawSelection`'s; modal listeners and caret DOM are disposed
with their extensions. `src/kernel` is unchanged.

Added eleven pure mapping/mode/selection tests and a native-settings regression,
plus the one Playwright spec explicitly requested by the owner (an exception to the usual
unit-only expansion policy). Plugin READMEs, `docs/vim-caret.md` and manual caret
scenarios are updated. The defaults/native-settings assertions fail against the
original HEAD manifest, with all four cursor fields absent.

Checks: formatting, lint, all TypeScript projects, build and 66 focused unit
assertions passed. `pnpm exec tsx --test` hit the sandbox's IPC EPERM; the
`node --import tsx` fallback passed. Playwright discovered and built the targeted
spec, but Chromium aborted before executing it in that sandbox
(`sandbox_host_linux.cc:41`, Operation not permitted). Runtime checks were run
later on the box: `docs/vim-caret.md` "Verification" lists the real VS Code and
Cursor comparison with the built-in caret and the Chromium geometry specs. The pinned human-learning checkout is unavailable here; the
installed codemirror-vim 6.3.0 implementation was read directly. No commit, push,
branch command or owner-profile installation was performed, as requested.

### Table editing parity follow-up — 2026-10-10

Implemented the measured Obsidian 1.14.4 table behavior from the owner's
`obsidian-tables-behaviour.md`: persistent widgets with raw focused cells,
aligned serialization on every cell edit, alignment-aware padding and stable
anchors in unchanged cells, document arrow entry, cell-attached row/column grips,
edge add buttons and expanded cell menus. Existing Tab/Enter append, boundary
arrows, pipe escaping, operations and sorting have additional unit coverage.
The decisions, starting differences and regression evidence are in
`docs/tables-diff.md`; the table README and manual plan are updated.

Checks, individually: changed-file Prettier, `pnpm lint`, `pnpm typecheck`,
**82/82** relevant units and `pnpm build` pass. The usual `tsx --test` launcher
cannot bind its IPC socket here; units ran through Node's `tsx` import hook.
Three existing layer-test wrappers cannot spawn their compiler subprocess;
direct negative-fixture compilation rejects DOM, Node and VS Code APIs as expected.
The one targeted browser spec cannot launch Chromium (`shutdown: Operation not
permitted`); no application interaction ran. No native tests or editor apps were
launched, as requested. Kernel unchanged, 815 TypeScript lines; no lint exceptions
or layer-rule changes. Changes remain uncommitted in the working tree.

Deferred/rejected: generic link menu policy awaits a shared editor contribution;
block insertion menus do not fit single table cells; private DOM/pixel copying
is not behavioral parity. Shift+Enter keeps the existing `<br>` encoding, with
reference verification deferred along with Obsidian add-button click effects.
DOM focus, hover, button and drag interactions, native undo, IME and two-panel
edits remain owner-run checks. The pinned human-learning checkout is absent.


### Properties parity with Obsidian 1.14.4 — 2026-10-10 (working tree)

Delivered: the supplied measured spec and probes were read; the existing sheet,
YAML helpers, type store and comparison screenshot were reviewed. The difference
and action table is `docs/properties-diff.md`, also copied to
`/tmp/properties-diff.md`. `/workspace/plans/properties-diff.md` cannot be written
under this session's sandbox roots. The pinned `~/Code/human-learning` checkout
is unavailable; no source repository or worktree was changed.

The sheet has the measured div hierarchy, icon spans, Lucide types, inline
contenteditable text/pill inputs, native typed controls, link pencil and persistent
non-mutating mismatch warnings. The existing vault/name type scope is retained
and pinned. Reserved types cannot be changed; Automatic clears a registry entry;
type changes no longer offer conversion or retain forced-value state, and renames
do not copy preferences between names. Icon and heading menus follow the measured
labels/submenus. Shared workspace collapse persists through validated RPC.

Keyboard/event units cover name-to-value focus, scalar Enter-to-row, field Tab
routing, row motion/Delete/Escape, quiet name rejection, pill addition/focus/edit/
removal and tag normalization. Mod+; opens an inline pending row with indexed vault
name suggestions. Empty rows survive Escape; notes without YAML get a temporary
sheet without text/undo changes. Repeated Add/display calls retain pending rows.
The Properties sanitizer permits only template-created contenteditables in its
existing escaped/sanitized HTML policy. Rich-paste routing excludes non-CodeMirror
contenteditables, preventing a property paste from also editing the body.

Added `test/fixtures/vault/property.md`, updated the plugin README and manual plan,
and added one targeted Playwright spec for the browser-only focus/widget paths
(the owner's explicit exception to the existing smoke-suite policy). No source
browser/native suite was ported; the retired ledger and kernel are untouched.
The kernel remains 815 formatted production lines, under 1,000. No lint limits,
layer rules or reviewed exceptions changed.

Validation: Prettier on changed files, `pnpm lint`, `pnpm typecheck` and
`pnpm build` pass. Selected unit tests pass **149/149**, including Properties,
ported YAML behaviours, rich-paste routing/conversion, menu routing, bootstrap,
host teardown, feature lifecycle/composition and lint/kernel constraints.
`pnpm exec tsx --test` was attempted but its Unix socket creation is denied
(EPERM); unit files were executed sequentially with `node --import tsx <file>`.
The unit log is `docs/checks/properties-parity-units.txt`. Five baseline tests
failed before the fixes, and the renderer-retention test fails on the original
HEAD source; details and evidence are linked in the diff.

Exactly one browser spec was attempted, one worker, no retries. Chromium failed
at launch (`sandbox_host_linux.cc`, shutdown Operation not permitted), before
any assertion; log `docs/checks/properties-parity-browser.txt`. No VS Code,
Cursor or Obsidian was launched, as requested. Actual visual parity, native
clipboard/picker behaviour, DOM reconciliation/focus and IME remain owner manual
checks. Browser failure is an environment limit, not a passing result.

Rejected/deferred: daily-note actions (no daily-note capability), identical
native picker appearance (platform/locale dependent), collapse shared across
unrelated workspaces (existing storage is workspace state), and unmeasured sort
persistence/collation, case-only key rules, fuzzy-name ranking and complex YAML
editing. Existing safe behaviour is retained for those cases. Every fix row is
implemented or pinned by a unit; no commit, push, branch change or publication was
performed, at the owner's instruction.

### Handoff cleanup and explicit reference navigation — 2026-10-10

On local branch `dot/finish-markdown-handoff`, based on the already committed
CI-drop revision `d96386cdf1e49aeef6bc5597e1c64dbe6c665618`: corrected stale
handoff claims, reconciled unit-default coverage with existing owner-approved
browser/native suites, and made unconditional pre-push `check:full` wording
consistent. Native suites stay out of CI; shared worktrees use sequential
checks and isolated displays/profiles without killing unrelated servers.

Added **Open Copied Agent Reference**, an explicit command over the public API
host plugin. It parses the existing `@path#start-end` format (including quoted
references), preserves full URI semantics, rejects malformed ranges and
relative escapes, reuses native symlink containment, and prompts for duplicate
paths across workspace folders. Candidate containment and workspace membership
are rechecked after the picker. Inclusive line ranges are resolved only after
editor readiness and flush, including CRLF. The command neither intercepts
native chat links nor implements a global history stack.

Native undo diagnosis found a duplicate-forwarding path: handled CodeMirror
history shortcuts still reached VS Code's unconditional webview key forwarding.
Added a narrow document-level guard and pure platform/modifier/non-Latin-layout
and disposal units. Preserve the manual one-logical-edit requirement; native
before/after evidence is pending, so this is not yet a native fix claim.

Validation so far: `git diff --check` and six focused pure units pass using
Node's built-in TypeScript stripping in temporary copies, with no installs.
Full formatting, lint, types, unit, browser and native checks await dependency
installation, currently blocked by approval-review cancellation. No browser or
native suites were added or run, and no push, merge, publication, owner-profile
installation or annotation-system work was performed.


### Local precise-jump history and deterministic reveal delivery — 2026-10-10

Owner chose separate in-memory per-document/pane histories, with native VS Code
cross-file navigation. Implemented editor-owned Back/Forward commands and title
arrows (100 entries), explicit jump capture, departure selection/geometric scroll,
forward truncation, source-edit rebasing and replay suppression. Session nonce,
source version, interaction generation and measured-layout acknowledgment guard
restores. Pane close clears history; webview recreation retains the host stack.
Vim Control shortcuts and Command shortcuts are unchanged. Agent/API jumps record
by default; the earlier opt-in agent-jump-setting proposal is superseded.

Replaced URI mailboxes with native-panel-addressed, webview-session-aware reveal
requests. Newer intents and disposal cancel old work; cold startup and reload
readiness are separate. Missing fragments produce a diagnostic. Ordinary persisted
views refresh geometric anchors at scroll/update settle and pagehide, using the
existing bounded pinning implementation. No annotation or shared global history
implementation is included.

Dependency installs remain blocked by approval-review cancellation. Direct Node
TypeScript-transform execution passes focused pure units and the real contribution
generator's check. Syntax checks and git whitespace checks pass; full Prettier,
lint, types, all unit/browser/native and computer-use acceptance remain unrun.
The owner authorized draft-PR publication before full validation and requested
Mac verification next. A draft is explicitly unverified; merging still requires
that verification. No application behavior is claimed verified by these checks.

### Mac validation repairs — 2026-10-11

The recovered precise-jump change now passes the required local `check:full` on
macOS arm64 with VS Code 1.141.0: 847 unit, 115 browser and 18 native tests. The
throwaway credential-free profile uses the owner's approved, opt-in
`VSCODE_TEST_MOCK_KEYCHAIN=1`; no personal profile or Keychain is used.

Native verification exposed a real heading navigation regression: the target
selection and viewport were applied, but subsequent focus restored the previous
viewport. Link/source navigation and local-history restoration now establish
focus before applying their selection and scroll. The existing native outline
centering regression verifies middle, early and final headings. Vim's macOS
host-shortcut bindings now preserve Control instead of consuming Command;
generated-contribution unit coverage protects Control+O/I and Command+I.

Other Mac repairs align native font comparisons with explicit matching editor
sizes/line heights and screenshot pixel comparisons with CSS pixels on Retina.
The existing assertions remain in place. Copied-agent-reference parsing, UUID
creation on the browser harness origin, strict formatting/types and narrow undo
coverage were also validated in the recovered change. Cursor and manual desktop
acceptance, including native Look Up, remain separate pending work; these results
do not claim them complete.

### Independent review follow-up — 2026-10-11

The current code reproduced the review's front-matter reveal acknowledgement
failure and loss of the Forward destination after an interrupted Back. Reveals
now compare the effective post-dispatch selection, including caret filters.
History preserves the departure snapshot before restoration and maps that
snapshot through source edits until an acknowledged replay or explicit new jump.
Cross-plugin unit coverage lives in `test/unit/editor/reveal.test.ts`; host and
pure-history regressions cover movement before a failed acknowledgement.

The native harness now waits for editor closure and for measured caret geometry
without widening its geometry tolerances. Mock Keychain remains an explicit
throwaway-profile opt-in; the duplicate unconditional macOS option was removed.
The post-review `check:full` passes on VS Code: 850 unit, 115 browser and 18 native
cases. Cursor startup and installed-build manual acceptance remain separate gates.

## Mac verification follow-up (2026-10-11)

The independent review fixes add generation-safe pane restoration, renderer
incarnation routing, early link intent ownership, exact reference containment,
and acknowledgement of the effective frontmatter caret. Interrupted Back keeps
its departing Forward destination unless the renderer proves no restore began.
A desktop-found search regression now retains the pre-query origin through
passive previews, including Enter, arrow buttons, Cmd+G and F3 acceptance. Reader
input, edits and panel disposal retire that pending origin.

Final local `check:full` passed 862 unit tests, 115 browser tests and 18 native
VS Code tests. The production VSIX Cursor run passed 16 tests with two editor
startup timeouts; both passed one isolated retry. Keep that instability visible.
CUA on the installed VS Code build verified heading/search history, branching,
independent panes, copied line selection and containment rejection, native
Back/Forward coexistence, Vim Control+O/I, and native Undo/Redo.

Cursor's visible sign-in overlay blocked remaining manual native-menu checks.
Built-in Markdown Cmd-click opens custom editors, but the host does not deliver
its precise heading/PDF fragment through the public custom-editor callback.
Physical gestures and exact sub-frame interruption timing remain unverified.
No commits, publication or merge were performed; final exact-head CI and the
coordinated merge remain the parent's responsibility after authorized publishing.

## Native precise-link integration (2026-10-11, validation in progress)

A window-scoped links plugin supplies ordinary DocumentLinks for local inline
Markdown heading/block targets from the built-in editor. Stateless signed source
version tickets avoid a bounded mailbox eviction failure. Native line/column
ranges remain with VS Code. Source-group ownership survives the host's separate
definition gesture to the same target, while unrelated tab/group changes, source
edits and reader caret movement cancel pending work. The existing exact-panel
reveal router handles destination acknowledgement and renderer generations.

New parser, ticket and gated-preflight cancellation units plus explicitly approved
browser/native regressions cover the integration. Full local checks and final
installed-VSIX desktop acceptance must complete before publication; this section
does not claim those new gates have passed yet. The previous verified snapshot is
preserved separately.

## Wiki suite on the workbench (2026-10-11)

Markdown Workbench now speaks the version-1 bridge envelope in
`docs/bridge-envelope.md` and adds five window plugins: bridge, wiki, assets,
scratch and marp. Agent PDF Viewer stays a second extension. The workbench
calls `vscodeEmbedPdf.bridge.envelope` only when that command is registered,
and it publishes `markdownWorkbench.bridge.envelope` without opening a chat.
Copy Link for Agent is unchanged. Wiki copy, asset import, scratch promotion
and Marp export never start an agent and never write the owner's vault.

A missing `.wiki/layout.json` is the legacy preset. A file that does not parse
is a diagnostic and is not guessed. Assets and scratch directories are created
only on the explicit command. A Marp deck inside the bundle is reported when
it lacks `type` and `generated` provenance; nothing adds that frontmatter.

`pnpm check` passed: format, lint, typecheck, 937 unit tests and contributions.
`pnpm test:browser` on this machine: 113 passed, 3 failed. The failures are
1–3px caret and line-number geometry in `font-size.spec.ts` and
`stable-blocks.spec.ts`. This change does not touch the webview renderer.
GitHub Actions browser on main is green, so those three are this VM's font
metrics, not a suite regression. `xvfb-run -a pnpm test:vscode`: 18 passed,
1 failed. The failure is Playwright 1.60 rejecting the key name `Left` in
`Alt+Left` inside `test/vscode/native-links.spec.ts`, after the heading
reveal had already succeeded. The installed extension activated and the other
native specs passed. Real VS Code specs are not in CI.

## Mermaid Vim source entry (2026-10-11)

Normal-mode single-step j/k/gj/gk now reuse Live Preview's reveal-aware block
entry through its injected service. The per-editor Vim adapter preserves Vim
command bookkeeping and leaves counts greater than one, operators and visual
selections with the dependency's existing behavior. It removes its listeners
and restores the adapter method on disposal. No Obsidian implementation was
copied; a disposable Obsidian 1.12.7 vault confirmed source-entry behavior.

Focused regressions cover both directions for Mermaid and HTML, source reveal,
ordinary counts/operators/visual selections/source mode, and existing caret
behavior. The installed isolated VS Code VSIX was checked with actual j/k/gj/gk
input: line 9 enters fence line 10, and line 15 enters fence line 14.

The required local pnpm check:full passed once: formatting, lint, types,
887 unit tests, 125 browser tests and 19 native VS Code tests. Evidence is in
the Mac task's mermaid-diagnosis-2026-10-11/check-full.log. Publication remains
a manual handoff; no remote branch was written by this task.

## Grokbot checkpoint (2026-10-11)

The owner stopped implementation and broad testing to hand over the current
`codex/editor-polish-links-tables` branch. Proportional reading defaults,
explicit-font preservation, compact properties/tags, caret-link Mod+Enter and
visible code selections are implemented. Nineteen focused unit tests and
eighteen focused browser tests passed, as did lint and typecheck. Table behavior
is still pending measured Obsidian findings. The final full gate and desktop
acceptance have not run for these changes; they are not installed in Cursor.
See `docs/HANDOFF_GROKBOT.md` for exact bases, evidence, capability limitations,
publication restrictions and the bounded successor checklist. The immediate
checkpoint follows the owner's explicit instruction to commit with lightweight
sanity checks instead of running the normally required full pre-commit gate.

## Vim table source motion (2026-10-12, working tree)

Implemented from the Obsidian 1.14.4 measurements in
`docs/obsidian-measurements/tables/vim-obsidian.md` and the raw A/B/C/G/H/I/J/K/L
logs. The implementer used measurement notes and logs as inputs and copied no
Obsidian code, CSS or assets; this describes implementation inputs, not the
measurement author's source-reading provenance. P cases are present in
`vim-cases.json` but absent from the raw log in this checkout; source mapping
units cover every documented column for the measured header and last row.

Live Preview exposes an optional persistent-widget query. Vim corrects only
Table layout overshoots to clamped source-line arithmetic, including counts,
operators, visual mode and display-line motions; Mermaid/HTML single-step
reveal and other widgets retain their behavior. Tables defer collapsed normal
source landings into their existing cell projection, reject pointer/projection
transactions and pending modes, and cancel stale work or disposed views.
In-cell normal counts and g prefixes hop one row. Operator/visual cell-buffer
behavior and EOF/start-of-note prose separators remain deliberate differences.

Added unit coverage for the pure column/delimiter mapping, arithmetic overshoot
decision, rendered-widget query, navigation routing and deferred entry guards
and cancellation. The owner-requested `tables-vim.spec.ts` adds 19 measured
browser regressions for entry/exit, offsets, counts, operators, visual source
traversal, paragraph motion and search. Plugin READMEs, `docs/tables-diff.md`
and the measurement note record the implementation and deliberate differences.

Validation: lint and typecheck passed, including the browser spec. Focused
units passed using `node --import tsx`; `pnpm test` cannot create tsx's IPC
socket in this sandbox. The equivalent full unit-file run passed 208/210 files;
unchanged `test/unit/layers.test.ts` fails because nested compiler diagnostics
are empty here, and unchanged `test/unit/webview/fonts.test.ts` expects the
previous prose-font fallback. Chromium cannot launch (`sandbox_host_linux.cc`,
operation not permitted), so the browser regressions, existing browser suites
and the parity probe remain for the parent's run. Native suites and
`check:full` were not run, as instructed. No commit or push was made.


## PR #16 review fixes (2026-10-12)

Bounded fixes for the two ChatGPT Pro reviews at PR head `f2244e8`. Live
Preview excludes fold-hidden widgets and exposes disjoint folded spans. Vim's
per-editor adapter uses fold-aware source targets, preserving fold skips when
counts also cross a visible table. Resolved motion policy is captured at the
pinned dependency's input-state reset, including mappings/macros and operators.
Source `j/k` retain `lastHPos`; adjacent single-step `gj/gk` table entry retains
the adapter's resolved column. Display counts, wrapping, half-page scrolling
and page motion keep native layout semantics. Disposal restores both hooks.

Deferred table entry keeps `queueMicrotask` with a cancellation generation for
selection/document changes, blur, mode transitions and disposal. The callback
rechecks all selection ranges, document identity, composition, focused content,
settled normal mode and active-table state; the existing entry path requires a
current rendered controller. The delimiter entry compatibility rule and blank
separator/host undo behavior are unchanged.

Links provides an injected caret-following service. Tables optionally consumes
it for cell Mod-Enter with the cell's own document/caret and the same open path.
The outer contentDOM focus guard remains. New unit cases cover fold/table
motion, resolved source/display goals and hook disposal, secondary-caret/focus/
mode cancellation, and cell link following with outer focus rejection.

Deferred as requested: spanning-widget visual painting, comparator-oracle
changes, collaboration/two synchronized panes, exhaustive macro/dot/IME and
off-screen search coverage. No browser/native coverage was added.

Validation: formatting, lint, typecheck and the direct-loader contribution
check pass. Added 18 unit regressions and updated the optional-dependency graph
assertion. All focused modules pass. `pnpm check` reaches `pnpm test`, which
cannot create tsx's IPC socket (`listen EPERM`). Running the same complete file
list with `node --import tsx --test --test-concurrency=4` passes 211/212 files;
only unchanged `test/unit/layers.test.ts` fails because its nested compiler
returns empty diagnostics, matching the previously recorded sandbox issue.
Browser, native and `check:full` remain for the parent's exact-head run as
instructed. No browser/native suites, push or merge were run.

Commit is blocked in this sandbox: `git add` cannot create the worktree's
`index.lock` in the read-only shared Git directory outside the writable roots.
Changes remain in this worktree; a complete patch and proposed commit message
are saved in `/workspace/plans/pr16-review-fixes.patch` and
`/workspace/plans/pr16-review-fixes-commit.txt` for the parent.

## Git diff round-5 integration and readability — 2026-10-12

Integrated the owner's approved main merges into `feat/git-diff-editor` without
conflicts. The initial `pnpm check` found two readability violations: the shared
block module had 406 counted lines, and destination parsing had complexity 16.
Table delimiter recognition now has a dedicated module with a cell predicate;
angle destinations have a separate scanner. Both retain the previous behavior,
including short GFM delimiters, escaped angle closers and malformed destination
rejection. Added unit cases for these boundaries; no browser/native cases added.

The round-5 parser, citation and filename fixes remain in this branch. Review
packets and the regex audit are under `/workspace/plans/review-gitdiff-{1,2,3}-round5.md`.
The release gate is the sequential `xvfb-run -a pnpm check:full`, with an isolated
native test profile. Its complete output is `/workspace/plans/gitdiff3-check-full.log`;
only a passing gate authorizes the normal push and the owner's approved merge.
Final counts, merge hashes and package evidence are recorded in
`/workspace/plans/merge-2026-10-12.log`. The upstream Markdown parser's known slow
100k-space-line parse and owner-run manual acceptance remain separate limits.
## Vim table word motions (2026-10-12)

Normal-mode `w`/`W`, `e`/`E`, `b`/`B` and `ge`/`gE` now navigate word
endpoints across rendered cells in row order, wrapping between rows. Counts
span cells; cells without words are skipped. Table edges clamp without changing
text, appending rows or creating prose separators. Operators, visual/insert
modes and unrelated pending commands retain the cell Vim buffer's behavior.
The projection uses the current cell session's text so retained whitespace does
not shift word offsets. Command routing clears completed counts/g prefixes
before a cell adapter is destroyed.

Small words use the installed Vim adapter's Unicode alphabetic/number
classification, so contiguous CJK (including `每个环境共用`) is a word;
WORDs group punctuation. Endpoints respect grapheme boundaries for astral
letters, emoji and combining accents. This is adapter-compatible segmentation,
not dictionary-based Chinese word splitting. No Obsidian code/assets were used.
The prescribed `~/Code/human-learning` checkout is absent on this machine;
implementation was based on this repository and its pinned installed dependency.

Failing-first evidence: five newly approved browser cases all failed on the
original implementation for `w`, `W`, `e`, `b` and `ge`. Five pure endpoint
regressions failed against the initial unimplemented helper, then passed after
implementation. Additional units cover routing guards and combining graphemes;
browser cases cover counts, blank cells, punctuation, CJK/Latin text and
operator/visual isolation. Validation results follow after the final gate.

## Table grid clipboard shortcuts (2026-10-12)

Column/row handles and rectangular cell selection focus a non-editable grid,
which does not reliably receive Chromium copy events. Grid Ctrl+C/Cmd+C now
claims the key and snapshots TSV through the existing validated Editor host
clipboard service. Copy preserves text, focus and grid selection; ordinary
cell-text copying keeps CodeMirror behavior. HTML/Markdown clipboard flavors
remain a future enhancement; the native clipboard API currently writes text.

Owner explicitly authorized new failing-first unit, browser and feasible native
coverage for this bug. Three new units failed before the fix; all six clipboard
units pass afterward. Three browser cases failed with an empty host clipboard.
The new installed VS Code case failed to paste the selected column before the
fix. The browser scenarios cover both modifiers, row/rectangle/single-cell
selection; the native scenario pastes the OS clipboard into ordinary prose.
Full validation results will be recorded below before committing.

The pinned human-learning checkout is unavailable at ~/Code/human-learning in
this environment. This fix uses this repository's existing table implementation;
no source, browser or native suite was ported and no reference repository changed.
## Selected table cells and inline code (2026-10-12)

Selected table cells now expose their selection background through rendered
inline code, preserving its foreground, font and spacing. The rule is scoped to
selected cells and excludes preformatted blocks; unselected code regains its
normal theme background when selection moves. Bold, links and MathJax output
already have transparent backgrounds and need no style changes.

The owner explicitly requested a failing-first browser regression. Both dark
and light cases failed against the original CSS on the computed code background
and pass with the fix. The tests use real column-handle selection, cover header
and body cells, inspect code/bold/link/math backgrounds and text contrast,
verify preserved foregrounds and bold weight, and check unselected/restored code
and unchanged source. Updated the Tables README and manual acceptance steps.
No Obsidian code, CSS or assets were copied. The pinned human-learning checkout
is absent from this environment; this is a local CSS correction, with no source
porting.

Validation: dependency installation and the two focused Chromium regressions
pass. Full required checks are recorded after completion in the task report at
`/workspace/plans/cell-code-report.md`.


## PR #30 round-two review fixes (2026-10-13)

Merged origin/main first, retaining the word-motion record alongside the incoming
clipboard and selection-color records and both relevant browser README entries.
Replaced raw word-key interception and synthetic Escape with a per-editor hook
that captures resolved moveByWords commands at Vim's input reset and routes their
normal-mode cursor landing. Counts, mappings, original macro keys and Vim command
bookkeeping remain in the dispatcher. Operator, visual, insert, composing and
multiple-selection cases retain the cell buffer. Hook disposal restores the
adapter and chains/restores the existing block-motion input observer.

Cross-cell word movement retains the cell editor and adapter so a synchronous
mapping or macro continues in the destination buffer. Retargeting suppresses
source writes during the buffer swap and retains the captured position object
for subsequent edits. Edge clamping now keeps the current position if the table's
word endpoint lies opposite the requested direction; valid endpoint clamping
when still ahead is retained. New unit regressions cover same-cell and cross-cell
record/edit/replay, both mapping directions, nonword mappings, all eight counted
motions, mode/selection guards, observer disposal, mixed empty edge cells and
retained whitespace.

Validation is limited by the owner's explicit instruction: no pnpm check,
check:full, full-repository lint or native suite. Root, webview-plugin and test
TypeScript checks pass; ESLint passes on the seven changed TypeScript files;
26 units across the three changed test files pass; all 26 cases in the existing
tables-vim Chromium browser spec pass. Exact commands, the report and full branch
diff are recorded in
/workspace/plans/review-pr30-round2.md. The pinned human-learning
checkout remains absent; only this repository and its installed Vim dependency
were read. No Obsidian code, CSS or assets were copied.

## Task checkbox focus investigation (2026-10-13)

The owner authorized a failing-first Chromium spec and limited validation to
TypeScript, changed-file lint, related units and that browser spec. The new
`tasks-scroll.spec.ts` constrains the harness panel so CodeMirror actually
scrolls, opens 220 wrapped Chinese tasks, scrolls to the middle and clicks one
visible task six times. It checks the complete source, scroll within four pixels,
unchanged selection and retained editor focus, with start/end/range selections
and Vim both enabled and disabled, using immediate and held mouse clicks.

All six cases failed before the fix on lost editor focus. An event trace showed
native mousedown transferring focus to the checkbox, then widget replacement on
toggle removing the focused input and leaving focus on the body. Cancelling the
inline checkbox's mousedown default preserves editor focus and still lets click
activate the checkbox. The edit already changes only the task marker without a
selection or scroll request; inherited WidgetType.ignoreEvent already excludes
checkbox events from CodeMirror mouse selection. No coordinate, widget height,
equality or pointer-selection changes were justified by the evidence.

The reported intermittent jump to the bottom did **not** reproduce in this
Chromium runtime, including repeated and held clicks with an off-screen caret.
The fix addresses a confirmed focus/caret defect and removes native mouse-focus
scrolling from this path; it does not establish the root cause of the reported
bottom jump. Reproduction in the affected app/runtime remains outstanding.

Validation: root, webview-plugin and test TypeScript checks pass; ESLint on the
two changed TypeScript files passes; all ten related task units pass; build and
all six cases in the new Chromium spec pass. No new pure logic needed unit
coverage. No broad checks, native suite, commits or pushes were run. The pinned
human-learning checkout is absent; only local code and the installed CodeMirror
dependency were read.

## Table grid collapse review fixes (2026-10-13)

Arrow collapse now saves a caret offset belonging to the target cell: zero
backward and its text length forward. Reopening a grid anchor clamps that saved
offset to the current cell length, including after an intervening source edit.
Collapse retains grid mode so the next Shift+Arrow extends cells. Printable
characters and Enter open a single selected cell and deliver the initiating key
to its keyboard handlers; unhandled printable input is inserted once with the
cell's normal input transaction. Enter uses the existing cell navigation keymap.

The owner explicitly authorized three Chromium regressions with Vim disabled.
They cover the abcdef/z collapse-and-extend sequence without runtime errors,
typing x after Left collapse, and Enter navigation after Left collapse. Three
new unit cases cover directional offsets, source shortening and reopening the
shorter anchor. Error collection starts after harness initialization to check
the keyboard sequence; an unrelated existing Vim-entry Context-disposal error
during feature initialization remains outside this fix. No reference code or
assets were copied; the pinned human-learning checkout is absent here.

Validation stayed within the owner's targeted scope: npx tsc --noEmit (root,
webview plugins and tests), ESLint on the three changed TypeScript files, all
86 table units, pnpm build, and all 59 tables-*.spec.ts Chromium cases including
column Cmd+C and tables-vim pass. The existing external-edit/remount case passed
on the first two-worker run, failed intermittently on the second, and passed
with all 59 cases on a serial rerun (--workers=1). No changes were made to that
case or its implementation. No pnpm check, full lint, native suite, commit or
push was run.

## Git diff editor main integration — 2026-10-13

Continued the already-started merge of origin/main (7b0e300). The sole conflict
was adjacent implementation records; retained both the branch's round-five
record and every incoming table, Vim, clipboard and task record. All incoming
code merged automatically. The owner requested the merge commit before targeted
diagnosis and validation, and explicitly excluded pnpm check and repository-wide
lint. Those targeted results will be recorded in the next phase. No push.

## Git diff editor targeted regression diagnosis — 2026-10-13

Continued from merge commit 8ce6f07, retaining main's table, Vim, clipboard and
task behavior alongside the rendered diff editor and inline Git features.
Reviewed the prior agent's edits: removed its temporary native-caret diagnostic
print and retained the three valid table screenshots, refreshed by verification.
No source behavior change or test assertion weakening was needed.

Classification of the eight failures in gitdiff3-check-full.log:

| Spec and original line | Classification | Evidence |
| --- | --- | --- |
| git-inline.spec.ts:25 | Intermittent native command acceptance | The final Close All Editor Groups palette stayed open; the same spec passes on main and the merged branch. |
| settings-commands.spec.ts:78 | Environment: VS Code renderer crash | Target crashed; an archived startup log also records renderer termination with signal 9. The process that sent the signal is unknown. |
| settings-commands.spec.ts:282 | Cascade from the missing renderer | workbenchPage returned undefined after the crash. |
| tables.spec.ts:62 | Cascade from the missing renderer | Same undefined-page failure. |
| tables.spec.ts:124 | Cascade from the missing renderer | Same undefined-page failure. |
| tables.spec.ts:200 | Cascade from the missing renderer | Same undefined-page failure. |
| vim-caret-vscodevim.spec.ts:96 | Cascade from the missing renderer | Same undefined-page failure. |
| vim-caret.spec.ts:255 | Cascade from the missing renderer | Same undefined-page failure. |

These classifications are supported by the prior successful 22-case retry, a
nine-case comparison at origin/main 7b0e300 in /tmp/gd3-main, and a fresh nine-case
merged-branch run before the helper changes. No branch-specific or reproducible
main product regression was found. The earlier post-merge investigation also
caught an intermittent restore/save failure; it did not recur in either
comparison. Its archived trace remains in
/workspace/plans/gitdiff3-native-first-failure.

The shared native command helper now waits until the requested result is the
input's active descendant, then accepts it once with Enter. This avoids mouse
acceptance timing without replaying toggles or editing commands. Missing-window
lookup now rejects explicitly with the startup-log location instead of returning
undefined, and ignores closed pages and DevTools. Two unit tests cover lookup
and the diagnostic. A later ten-case native run passed diff-editor, inline Git,
all tables and Change Setting but exposed three more timing failures: the
settings palette did not open, and the built-in carets were hidden in both
comparators. Native helpers now explicitly activate the isolated window and
verify document focus before opening notes and measuring built-in carets;
palette opening first leaves the webview through the status bar. Caret geometry
and behavior assertions retain their original tolerances. The failed run and
traces are archived in /workspace/plans/gitdiff3-native-focus-failure. Window
activation fixed the palette failure, but the caret failures persisted. A
focused diff-editor/caret diagnostic established the actual cross-spec cause:
Source Control's commit-message box is the first Monaco editor, before the note.
The diff-editor test exposes it by opening Source Control. Both native caret
comparators now select the visible Monaco editor containing the fixture line,
and measure its own cursor and text origin. This fixes a test-harness regression
exposed by the branch's diff-editor scenario, without changing product behavior
or hiding Source Control. Diagnostic prints were removed; evidence is in
/workspace/plans/gitdiff3-caret-diagnostic.log. Renderer crashes still fail the
suite; they are not hidden by retries or automatic relaunch.

Validation: pnpm build, pnpm typecheck, ESLint limited to the changed TypeScript
and MJS files relative to origin/main (plus the new unit file), and all 1,114
unit tests pass. All 97 relevant browser cases (tables-*, git-* and vim-*,
workers=1) and all ten targeted native cases pass, including
git-diff-editor.spec.ts and the new main table-column clipboard case. Suites
ran sequentially with 900-second timeouts. Native runs use a private Xvfb
display and the harness's isolated profile. No new browser/native cases were
added. The pinned ~/Code/human-learning checkout is absent here; no reference
repository, code or assets were modified or copied. No pnpm check, repository-wide
lint, push or publication was run.

A repeated full unit run hit the existing rendered-row fuzz child-process
20-second deadline on linkopen/adv→adv+ (1,113 passed, one timed out), after two
full 1,114-pass runs. Its evidence is saved in
/workspace/plans/gitdiff3-unit-timeout.log. No fuzz input, assertion or timeout
was changed. The final pnpm test rerun passed all 1,114 tests, including the same rendered-row
fuzz target. Final build/typecheck/targeted-lint/unit/browser/native logs and
both nine-case branch/main comparisons are in
/workspace/plans/gitdiff3-targeted-validation/. Final verification changes only
native helpers/spec selectors, two units, this record and the three reviewed
table screenshots. No product implementation change was necessary.

## Rendered diff review fixes — 2026-10-13 (working tree)

Read the complete review at `/workspace/plans/review-diff-editor-pro-answer.md`.
Diff fragments now retain body thematic breaks and setext headings; whole-document
rendering still strips actual frontmatter. Reference definitions are parsed into
fresh Markdown-It environments instead of appended to fragment source. Opaque
blocks also exclude appended footnote context.

Each panel follows native document edits, Git repository events and a scoped
working-file watcher, retaining the existing reread/version/disposal guards.
Independent side resolvers reuse NoteResources vault resolution and containment.
Local images receive webview URLs; Git images read bytes at the side's revision.
Resource roots include only the extension bundle and those vaults, with the
existing restricted image CSP permitting webview and data URLs. Unresolvable or
failed images expose their escaped source fallback. Panel messages now use shared
schemas in both directions. Assets absent from the current vault index retain
that explicit fallback, including historical assets no longer indexed.

Removed the absolute `.vscode-test` symlink from the index with `git rm --cached`
and added an exact ignore entry for the symlink as well as the existing directory
entry. Added nine unit regressions covering fragments, unchanged unclosed fences,
closed native document refreshes and subscription cleanup, independent image
resolution/revisions/roots/fallbacks, service lifetime, message validation and
cache tracking. Updated resource/diff READMEs and owner-run manual scenarios.

Validation: `pnpm typecheck` passed; ESLint on only the 19 changed TypeScript files
passed; `pnpm test` passed all **1,123** tests, including the final revision-image
assertions. Logs: `/tmp/gitdiff-review-{typecheck,eslint,test}.log`. Git whitespace
checks passed. No pnpm check, repository-wide lint, browser/native suite, commit,
push or publication was run. The pinned `~/Code/human-learning` checkout is absent;
only this repository and its installed dependencies were used, with no reference
repository modified or copied.

## Obsidian table document jumps and Properties gutter — 2026-10-13 (working tree)

The temporary table cell owns a separate Vim buffer. Its resolved-motion hook
previously routed only word movement, so `gg` and `G` used the cell's local
one-line document. The same hook now routes normal document-line motions after
Vim resolves prefixes, counts and mappings. The projection waits for Vim's
command bookkeeping to finish, closes the cell, clears the active table, and
focuses the outer caret on the requested source line's first non-whitespace
character. Uncounted `gg` targets line 1, uncounted `G` the last line, and counts
clamp to the source document. A table-source destination stays in the outer
editor. Operators, visual and insert commands retain their existing routing.

The line-number gutter previously treated Properties like every other rendered
replacement block and labeled it with its first source line (`1`). Gutter labels
now exclude the parsed frontmatter range, including its closing delimiter;
subsequent lines keep their real source numbers. Updated the existing font-size
numbering assertion and both plugin READMEs.

Owner-requested regressions extend `tables-vim.spec.ts` for both document edges,
counts, clamping, continued outer movement and table-source destinations.
`gutter-selection.spec.ts` checks an unnumbered Properties widget followed by
source lines 8 and 9. Units cover resolved document counts/mappings and
frontmatter text/widget labels. The prescribed `~/Code/human-learning` checkout
is absent here; implementation used this repository and its pinned Vim package.

Validation: typecheck and ESLint on changed TypeScript files pass; `pnpm test`
passes all 1,130 tests. The initial targeted browser run passes all 52 cases in
`tables-vim`, `gutter-selection` and `font-size`. After the final routing change,
33/34 table cases pass, including both new table-source destination cases; one
existing `k` case times out in harness `page.goto` before editor assertions and
passes on an isolated rerun (1/1). No `pnpm check`,
repository-wide lint, native suite, commit or push was run, as instructed.

## P1 synchronous table Vim document handoff — 2026-10-13 (working tree)

Read `/workspace/plans/review-obsidian-parity-pro-answer.md`. Document jumps now
release the logical cell session, clear the active table and place/focus the
outer caret synchronously. The injected Vim service redirects subsequent key
resolution from the old cell adapter to the outer adapter before a mapped or
replayed sequence dispatches its next key. Only cell editor/adapter teardown
and redirect release wait for a microtask, so the current motion can finish its
bookkeeping. The dispatcher hook is context-owned, adapter-scoped, restores on
stop and preserves other panels when they stop out of registration order.

The owner explicitly requested two browser regressions. Both fail against the
original code: Q -> ggx changes alpha to lpha instead of deleting the first
prose character; Q -> ggG leaves the caret on line 1 instead of the last line.
They assert the complete source, focused outer editor, absent cell editor and
final source caret line. Seven unit cases cover both mappings and macro replay,
a counted second jump followed by editing, redirect release, unaffected adapters
and out-of-order panel disposal. Plugin READMEs describe the handoff contract.
The prescribed ~/Code/human-learning checkout is absent here; only this repository
and its pinned Vim dependency were read. No reference code or assets were copied.

Validation: `pnpm typecheck`, ESLint on only the seven changed TypeScript
files, `pnpm test` (all 1,137 units), `pnpm build` and all 56 Chromium cases in
`tables-vim`, `gutter-selection` and `font-size` pass. The final browser run used
`npx playwright test -c test/browser/playwright.config.ts tables-vim.spec.ts
gutter-selection.spec.ts font-size.spec.ts --workers=1`. Logs are saved as
`/tmp/obsfix-p1-{typecheck,eslint,test,build,browser}.log`; the failing-first
evidence is `/tmp/obsfix-p1-browser-before.log`. No pnpm check, repository-wide
ESLint, native suite, commit or push was run, as instructed.

## P1 round-two table Vim insertion handoff — 2026-10-13 (working tree)

Read `/workspace/plans/review-obsidian-parity-round2-pro-answer.md`. Redirecting
only command lookup left the dependency's mapping executor and macro replay with
cached cell adapters and mode objects. The dispatcher now supplies forwarding
adapter, state and mode objects that follow the destination at the next key
lookup. The handing-off motion finishes its cell bookkeeping first; subsequent
mode checks, literal insertion, special-key fallback and separately recorded
macro insert changes operate on the outer editor synchronously. Real cell state
is retained for teardown, and the context-owned hook still restores correctly
when panels stop out of order. This preserves the dependency's mapping and macro
execution rather than reconstructing recorded insert edits from key strings.

All three owner-requested Chromium insertion regressions failed against the
original code and pass with the fix: Q -> ggiZ<Esc>, Q -> ggciwZ<Esc> and a macro
recorded with actual typed text, then replayed from a cell. They assert the full
outer document (including unchanged table cells), outer focus and final normal
mode. The existing mapping browser cases also cover gg2Gx alongside ggx/ggG.
Seven added unit cases cover insert/replacement mappings and macro insert changes,
including Space/Enter/Escape, plus horizontal goals across blank lines. The first
full browser run exposed that binding stored motion functions changed their
identity and reset vertical goals; binding is now limited to adapter methods.
Existing routing and disposal cases remain intact.
Updated the Vim README. The pinned ~/Code/human-learning checkout is absent;
only this repository and its installed Vim dependency were read. No reference
repository or Obsidian code, CSS or assets were modified or copied.

Validation follows the owner's targeted scope: no pnpm check, repository-wide
ESLint, native suite, commit or push. Final check results are recorded below.

Final validation: `pnpm typecheck` and ESLint limited to the three changed
TypeScript files pass; `pnpm test` passes all **1,144** units. All **60** Chromium
cases pass with `pnpm exec playwright test -c test/browser/playwright.config.ts
tables-vim.spec.ts gutter-selection.spec.ts font-size.spec.ts --workers=1`.
Changed-file formatting and Git whitespace checks pass. Logs are
`/tmp/obsfix-p1r2-{typecheck,eslint,test,browser}.log`; failing-first insertion
coverage is `/tmp/obsfix-p1r2-browser-before.log`, and the corrected intermediate
motion-identity regression is `/tmp/obsfix-p1r2-browser-motion-identity.log`.
No forbidden checks, native suite, commit, push or publication were run.

## Vim Shift+4/6 input-source investigation — 2026-10-13 (working tree)

The owner requested browser reproduction, a fix and regression coverage, limited
checks to the affected behavior, and prohibited pnpm check, repository-wide lint
and commits. Inspected cell editing, word/document routing, projection, table
entry, Vim sequence routing and package keybindings. No binding captures plain
Shift+4/6. Existing disposable-vault Obsidian measurements and fresh Chromium
controls agree: ASCII `$` lands on the last cell character, `^` on its first
nonblank character, and `0` at its start. The same logical-line motions work in
ordinary paragraphs and wrapped CJK text.

The pinned Vim dependency converts non-ASCII single-character keys through the
last character of their physical code, making Shift+4 `￥`/`¥` a count `4`. Chinese
`……`/`…` is unbound, and `Process` is deferred to text input. Before the fix,
all nine non-ASCII end-motion cases failed in prose, wrapped CJK and cells while
three ASCII controls passed; three independent non-ASCII first-nonblank cases
failed while their ASCII control passed. Playwright's Shift+4 notation itself
sends key `4`, so the trusted ASCII controls use Shift+$ / Shift+^; Chinese cases
explicitly replay the reported key/code and Process/229/composing event shapes.
This reproduces the event-handling defect, not an actual macOS input-source
session.

The Vim plugin now includes a shared, view-owned keyboard adapter in both note
and cell extensions. It translates only the reported shifted Digit4/Digit6
variants in normal mode, before composition filtering, and redelivers a regular
command key through the existing dispatcher. Counts, operators, mappings and
macro recording/replay remain native. ASCII input, other physical keys,
modifier shortcuts, insert/visual mode and literal-character arguments retain
their existing routing. A composition-start guard covers the interval before
its first edit; prompt exclusion checks for an input so macro-recording
notifications do not suppress commands. Two new guard regressions exposed those
initial implementation mistakes and pass after correction. No table motion or
projection behavior needed changing.

Added 25 key-policy units and 22 owner-requested Chromium regressions, plus the
Vim README and macOS manual acceptance scenario. The prescribed
~/Code/human-learning checkout is absent; only this repository, its recorded
behavior measurements and installed dependencies were read. No reference
repository or proprietary code, CSS or assets were modified or copied.

Final targeted validation: ESLint on the four changed TypeScript files,
webview-plugin and test TypeScript projects, all 65 related units, changed-file
Prettier and Git whitespace checks pass. The sequential final Chromium run
passes all 71 cases (22 new line-key regressions, 40 existing tables-vim and nine
existing vim-block-motion cases): `pnpm exec playwright test -c
test/browser/playwright.config.ts vim-line-keys.spec.ts tables-vim.spec.ts
vim-block-motion.spec.ts --workers=1`. Unit validation used `pnpm exec tsx --test`
with keyboard.test.ts, motion.test.ts, word-navigation.test.ts,
navigation.test.ts and test/unit/vim-key-routing.test.ts only. Logs are
`/tmp/vimdollar-{unit,browser-after,typecheck,eslint}.log`; failing-first evidence
is `/tmp/vimdollar-browser-before.log` and `/tmp/vimdollar-caret-before.log`.
No pnpm check, repository-wide lint, full unit/browser/native suite, commit,
push or publication was run. Real macOS input-source acceptance remains manual.

## Markdown Outline title actions and Follow Cursor — 2026-10-14

Previous mechanism: the `outline` window plugin supplied a custom Explorer
TreeView (`markdownWorkbench.outline`, **Markdown Outline**) for the active
Markdown Workbench panel. It read text through `vaults.text`, nested parsed
headings by level and refreshed after editor/document events with a 300 ms
debounce. Selection notifications captured the sorted selection start and
unconditionally revealed its preceding heading when the view was visible.
Items navigated through `vaults.open` at their original-source offsets. There
were no title actions or follow preference; native Outline used VS Code's
built-in Markdown support.

Delivered: the tree opts into VS Code's native Collapse All action. Expand All
reveals every heading in parent-first order, including all six Markdown heading
levels, without selecting or focusing items. The overflow menu has mutually
exclusive enable/disable Follow Cursor commands, controlled by
`markdownWorkbench.outline.followCursor`. The setting of the same name is
resource-scoped, defaults to true and persists through the existing settings
adapter. Public command contributions do not expose native checked state, so
the enabled variant uses the visible title **✓ Follow Cursor** and the disabled
variant **Follow Cursor**.

Following reveals and selects without focusing when the cursor, current panel,
document or view visibility changes. A small schema-validated `captureCursor`
RPC returns the active selection end and synchronization version, with table
positions projected into the outer document. The tree reads authoritative
TextDocument text and maps LF editor offsets to untouched CRLF source offsets.
Panel identity, document/synchronization versions and request generations reject
obsolete replies, including two panels of the same note. Plugin-owned cleanup
cancels timers, disposes registrations and clears its context key using a
captured workbench service after services are withdrawn. Heading clicks retain
their navigation behavior with following either on or off. The optional
DocumentSymbolProvider was not added; native Markdown support remains in use.

Files changed:

- `src/plugins/outline/{host,manifest,actions,commands,tree,view}.ts` and
  `src/plugins/outline/README.md`.
- `src/plugins/editor/{protocol,webview}.ts` and `src/plugins/editor/README.md`.
- `src/host/views.ts`, `src/shared/{runtime,manifest}.ts`,
  `scripts/generate-contributions.ts` and generated `package.json`.
- `test/unit/outline/{fixture,host.test,tree.test}.ts`,
  `test/unit/contributions.test.ts` and `test/unit/views/fakes.ts`.
- `docs/MANUAL_TEST_PLAN.md` and this phase record.

Validation, limited to the owner's requested scope and run sequentially:

- `timeout 180s pnpm typecheck`: all seven TypeScript projects pass.
- `timeout 180s pnpm exec eslint --max-warnings=0 <17 changed TypeScript files>`:
  passes with no errors or warnings.
- `timeout 120s pnpm exec tsx --test` with
  `test/unit/outline/{headings,tree,host}.test.ts`,
  `test/unit/ported/outline.test.ts`, `test/unit/contributions.test.ts`,
  `test/unit/plugins/capabilities.test.ts`, `test/unit/views/views.test.ts`,
  `test/unit/tags/view.test.ts` and `test/unit/editor/bootstrap.test.ts`:
  **39/39 pass**.
- `timeout 60s pnpm exec tsx --test --test-name-pattern='outline'
  test/unit/features/leave-no-trace.test.ts`: **1/1 selected test passes**,
  36 unrelated tests skipped.

Logs: `/tmp/outline-mw-{typecheck,eslint,unit,lifecycle}.log`. Changed code was
formatted and contributions regenerated, with generator consistency covered by
the targeted unit run. Dependencies were installed from the offline pnpm cache
without scripts or lockfile changes. No pnpm check, repository-wide ESLint,
full unit suite, browser/native suite, push or publication was run. Manual
scenarios cover expansion, persistent toggles, panel switches and active ends.
The pinned `~/Code/human-learning` checkout is absent; no reference repository
or proprietary code, CSS or assets were modified or copied.

## Vault graph and read-only Sources — 2026-10-14

Ships the approved OKF slices in one change. The window plugin `okfCore`
provides `okf` and registers a vault link policy; the vault never imports it.
Inside a bundle, `/…` is bundle-root relative and `./` / `../` are relative to
the source file. An explicit miss stays unresolved. Wikilinks and notes outside
a bundle keep the existing vault rules. Renames use the same policy when it
supplies link text. Open panels share a facade, so stopping `okfCore` does not
restart the editor. `properties` provides `propertyRenderers`. `sourcesProperty`
draws stacked read-only Sources rows and opens only `http`/`https` or an
in-policy workspace file from the row's own document. `command:`, `javascript:`
and `data:` are not links. Nothing is fetched. `graph` is a document-independent
panel (`markdownWorkbench.graph`) using graphology and Sigma in their own
bundles. It draws one chosen OKF bundle, directed aggregated body links and
embeds, local and global modes, and refuses graphs over 2000 notes, 20000
edges or 1.5 MB. The layout worker stops while the panel is hidden and when
the panel is disposed.

Sources writes, sources-derivation edges, trust badges, 3D and saved layouts
are not in this change.

Validation: `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (seven projects),
`pnpm test` (1225 unit tests), `pnpm contributions --check` and a production
`pnpm build` pass. `THIRD_PARTY_NOTICES.md` was regenerated from that build.
Chromium `properties-parity` and `properties-caret` pass (11 tests). The rest
of the browser suite and the native VS Code suite were not re-run.

## Review fixes for the vault graph and Sources — 2026-10-14

Corrects seven resolution and presentation bugs from the review of that
change. A vault-root bundle (`""`) is stored and removed like any other root.
Markdown and wikilink intent is stored with each indexed link and passed to
the policy; an extension no longer decides which rules apply. A Markdown link
that misses does not open a conflicting vault-root file, and navigation does
not fall through after that miss. A move into another bundle rewrites Markdown
as an explicit source-relative path that resolves again. The properties sheet
paints `propertyRenderers` on the first mount and rebuilds when they change.
Sources treats parent-relative resources as clickable and lets the host check
containment. A `#fragment` is removed before the file lookup; a heading or
block fragment still opens at its offset. The graph layout worker is fetched
from the extension and started from a `blob:` URL, then terminated and revoked
on dispose.

Filter positions are still dropped when a filter hides a node, and this change
does not add browser or native coverage for the Sources mount or the worker.

## ChatGPT Pro r2 remaining blockers — 2026-10-15

Resource loading now carries Markdown versus wikilink syntax so a Markdown
image inside an OKF bundle resolves source-relative. Unclaimed Markdown links
outside OKF fall through to source-relative navigation instead of wikilink
index lookup. Sources `#page=` / `#viewrect` fragments are forwarded through
`vaults.open` to the native viewer.

## ChatGPT Pro r3 remaining blockers — 2026-10-15

Sources opens authorize the owning document (known source note) and contain
the target via `authorizeTarget`, so a PDF such as `/raw/paper.pdf#page=3` no
longer fails the note-source allowlist. Embed "Open image file" passes each
resource element's `data-wiki` intent into `links/open`, so a Markdown image
opens the Markdown-resolved sibling rather than the wikilink vault-root twin.

## Phase record — mouse selection scroll + Mermaid UI (15 October 2026)

Live Preview mouse drags near tall blocks (images, Mermaid, ASCII fences) jumped
the viewport. Root causes verified in code:

1. `editOnClick` ran on **mousedown** with `scrollIntoView: true` and
   `preventDefault`, so clicking/dragging a rendered Mermaid/math/code widget
   scrolled to the fence start and blocked selection.
2. A `mousemove` with a transient `buttons === 0` (common on remote desktop
   during fast drags) thawed the pointer reveal freeze mid-gesture, so Live
   Preview reflowed under the live selection and heights jumped.
3. Block/inline/code-source decorations still rebuilt on every selection tick
   while the freeze was active, thrashing widget DOM needlessly.

Fix: defer click-to-edit until a non-drag mouseup without forced scroll; let
CodeMirror handle mouse events through block widgets (buttons excluded);
debounce buttons-up release by 50ms; skip decoration rebuilds while
`isPointerSelecting`. Mermaid Copy/Edit share one row (`top: 10px`, aligned
sizes); SVG labels opt into `user-select: text`.

Files: `src/webview/ui/{pointer-selection,markdown-widget}.ts`,
`src/plugins/livePreview/{blocks,inline}.ts`,
`src/plugins/codeBlocks/{code-source.ts,codeBlocks.css}`,
`src/plugins/diagrams/diagrams.css`, `src/webview/styles/markdown.css`,
`test/unit/webview/{pointer-selection,selection}.test.ts`.

Validation: eslint on changed files; `tsx --test` pointer-selection + selection
unit tests (7/7); `tsc` for webview, plugins webview, and test projects.

## Review fixes for mouse selection / Mermaid widgets — 2026-10-15

Addresses two P2 findings from the ChatGPT Pro review of PR #46:

1. `ignoreEvent` no longer uses unbounded `target.closest(interactive)` (which
   matched the outer `.cm-content[contenteditable]`). Ownership is bounded to
   `.hybrid-block`; `selectionchange` stays with the widget so native Mermaid
   SVG label selection is not remapped; SVG `<text>` / `<tspan>` keep native
   mouse handling while blank diagram area still goes to CodeMirror.
2. Click-to-edit uses a full gesture lifecycle: drag latches once the threshold
   is crossed (even if the pointer returns), document-level mouseup only commits
   when the matching press ends over the widget, and blur / pointercancel /
   outside release clear the pending press without editing.

Files: `src/webview/ui/markdown-widget.ts`,
`test/unit/webview/markdown-widget.test.ts`.

## Pointer freeze skips native Mermaid label selection — 2026-10-15

Addresses the remaining ChatGPT Pro P2 on PR #46 after the ignoreEvent /
click-to-edit round:

1. `pointerSelectionTracking` no longer freezes on primary mousedown over
   Mermaid SVG `<text>` / `<tspan>`. Thaw was dispatching a transaction that
   ran CodeMirror `updateSelection()` and cleared the browser's native label
   selection. Ordinary Live Preview drags still freeze so tall blocks do not
   reflow mid-selection.
2. Thaw is deferred with `setTimeout(0)` instead of `queueMicrotask`, so a
   `pointerup`-first gesture cannot reveal/destroy the widget before
   click-to-edit's `mouseup`.

Files: `src/webview/ui/{pointer-selection,markdown-widget}.ts`,
`test/unit/webview/pointer-selection.test.ts`.

## Wide-table mouse selection scrolls horizontally — 2026-10-15

Rectangular cell selection and handle drags on a wide Live Preview table did
not extend rightward past the visible columns. `EdgeScroll` was wired to the
note `scrollDOM`, but wide tables keep horizontal overflow on `.table-scroll`
(`overflow-x: auto`; the note does not widen). Dragging near the table's right
edge therefore never auto-scrolled, so `cellAtPoint` kept resolving to the
last on-screen column.

Fix: `EdgeScroll` accepts an optional horizontal viewport (defaults to the
vertical one). Table selection and handles pass `grid.scroll` for X and the
note scroller for Y. Properties order is unchanged (one viewport for both).

Files: `src/webview/ui/edge-scroll.ts`,
`src/plugins/tables/{grid,selection,selection-drag,handles,controller}.ts`,
`test/unit/webview/edge-scroll.test.ts`, `test/unit/tables/hit-test.test.ts`.


## Pointer release timers scoped to gesture generation — 2026-10-15

Addresses the remaining ChatGPT Pro P2 on PR #46 (r3): release timers could
outlive their gesture and thaw a newly held drag.

1. `onGestureEnd` only arms the buttons-up debounce while `isActive()` is true
   (pointer freeze present), so idle hover cannot schedule a release that fires
   after a later press. `cancelPending()` lets a new primary press drop any
   in-flight buttons-up timer from a prior gesture.
2. Each editor-selection press bumps a gesture generation, clears deferred thaw,
   and re-establishes the frozen selection. Deferred thaw callbacks no-op when
   their captured generation is stale, so release → new press before `setTimeout(0)`
   cannot clear the second freeze. Native Mermaid SVG label bypass is unchanged.

Files: `src/webview/ui/pointer-selection.ts`,
`test/unit/webview/pointer-selection.test.ts`.

## Sources resource path decoding — 2026-10-15

`workspaceTarget` now splits the fragment with `splitLinktext`, applies
`decodeLinkPath` to the path segment only, then joins the vault path. That
matches Markdown link decoding so percent-encoded Chinese (and other) Sources
`resource` values hit the Unicode vault index.

Unit coverage: encoded Chinese relative paths, already-decoded Unicode,
fragment preservation, unchanged HTTP(S) URLs, and malformed percent escapes
that must not throw.

Validation: `pnpm exec tsx --test test/unit/okf/authorize.test.ts` — 11 pass.

## Selected table rows keep vertical wheel scrolling — 2026-10-15

Static diagnosis: selecting a row focuses the persistent `.hybrid-table`
widget. Its `.table-scroll` wrapper uses `overflow-x: auto`, which also
computes vertical overflow to `auto`, creating a nested scrollport. Idle wheel
input over the table depended entirely on Chromium's native scroll chaining;
there was no vertical wheel handoff to the note. `TableWidget.ignoreEvent()`
keeps widget input out of CodeMirror's handlers, and EdgeScroll owns active
pointer drags only. No table wheel handler was cancelling input. The reported
trap is consistent with wheel input remaining in that nested scrollport after
grid focus. DOM reproduction could not be completed in this sandbox (below).

The table controller now owns a non-passive wheel listener through its abort
signal. `wheel-scroll.ts` forwards predominantly vertical input to the owning
note scroller, normalizing pixels, lines and pages using note geometry. It
only cancels the nested default when the note can scroll. Horizontal and
Shift-wheel gestures, zoom modifiers, handled/noncancelable events and native
chaining at note boundaries retain their defaults. Selection, focus, cell
projection, horizontal overflow CSS and pointer/handle EdgeScroll are unchanged.

Coverage: seven unit tests exercise both directions, fractional trackpad input,
delta units, horizontal jitter, horizontal/Shift-wheel gestures, zoom/handled
events and note limits. The owner-authorized browser regression exercises real
wheel input with a selected row in a wide, tall table, with Vim on and off,
checking both axes, Shift-wheel, retained selection/focus and unchanged text.
The Tables manual plan also covers columns, rectangles, cell editing and edge
drags. README file/flow documentation is updated. All fixtures are synthetic;
the configured `~/Code/human-learning` source checkout is absent here.

Validation:

- `node --import tsx --test src/plugins/tables/wheel-scroll.test.ts`: 7/7 pass.
- `pnpm typecheck` and Prettier on the touched files: pass.
- `xvfb-run -a pnpm exec playwright test -c test/browser/playwright.config.ts
  test/browser/tables-scroll.spec.ts --workers=1`: 2/2 pass (vim on/off). The
  browser fixture reveals the table into the CodeMirror viewport before querying
  cells so the widget mounts.
## Hand-editable Properties (nested + Sources) — 2026-10-15

Every frontmatter value is editable in the Properties sheet. Scalars and scalar
lists keep their existing controls. Nested maps and list-of-maps (including
`generated` and `sources`) edit as YAML drafts that write back through
`propertyChanges` / `set`. The Sources custom renderer still draws open links
above that draft; the Copy id control is removed (id is selectable text).

Review follow-ups: YAML draft flush/focus include `textarea`; empty `sources: []`
keeps the custom renderer + YAML draft; `yamlValue` sets `aliasDuplicateObjects:
false`; string scalars keep YAML's needed quotes (e.g. ids like `"01"`); replacing an
anchored value (including descendant anchors) strips `&anchor` and inlines the
document-resolved prior value at aliases that `resolve()` to those nodes.
Structured merge uses the same alias-safe set path. YAML drafts bind to the
frontmatter bytes and property value at field bind time: invalid YAML and
concurrent property/header changes reject without writing. Idle fields refresh conflict baselines on focus. Merge drops overlapping alias-preservation spans when the paste also replaces those aliases. Verification uses cycle-safe equality.

Validation: unit tests for Sources markup (no Copy id), sheet HTML YAML drafts
(including empty Sources + custom), `propertyYamlInput`, set round-trips for
`generated` / `sources`, invalid YAML rejection, concurrent draft conflicts,
quoted ids, and alias-safe nested/reused/descendant sets. `pnpm check` green.

## Codex r12 Properties review fixes — 2026-10-15

Explicit row Copy/Cut clears the DOM text selection before requesting the copy
event, so menu cuts write the complete YAML and structured property payload
before removal. Native copying of selected Sources ids and other row text keeps
its existing bypass. Alias materialization now uses flow YAML with JSON-quoted
strings, preserving `.nan`, `.inf` and `-.inf` even inside collections without
introducing multiline inserts or anchors. Anchor targets are indexed by node in
a Map; each external alias resolves once before lookup, including reused anchor
names.

Nine new unit regressions cover row Copy/Cut with selected id text, native
Copy/Cut, the three non-finite scalars during structured paste, nested aliased
collections with multiline strings, and one resolution per alias across many
targets. Existing minimal YAML edits, unrelated comments/keys, invalid drafts
and field conflict tests remain passing.

Validation: Prettier, ESLint, all seven TypeScript projects and contributions
check pass. Direct `node --import tsx <test-file>` runs pass 121 tests across 25
Properties/YAML/Sources files (including ported property editing/order tests).
A 7,579-byte header with 200 descendant anchors and 200 external aliases took
109.04 ms in `propertyChanges`; all 201 edits and every mirror value were checked.

Focused Properties/YAML/Sources unit tests pass (109). Broader `pnpm check`
may hit sandbox `tsx` IPC `EPERM` in some environments; use
`node --import tsx --test …` as the fallback. Browser/native suites not re-run
for this review fix.

## PR #49 GPT-5.6 review blockers — lossless YAML, 2026-10-15

Nested YAML drafts now use the property's AST source range, with only outer
indentation removed. The sheet passes that raw text through `PropertyField`,
the editor adapter and `propertyChanges`; parsing validates the draft and its
decoded projection, while the write uses the draft text. Comments from the
original subtree and comments typed in the draft survive, along with scalar
quoting, supported scalar tags, exact integer text, block-scalar newlines and
CRLF. Source replacements retain unrelated frontmatter bytes and compose with
alias preservation and displayed ordering in one transaction.

Alias preservation reparses the original body with `intAsBigInt`, avoiding an
already-rounded Number in the caller's AST. Materialized collections retain
large integers and nested aliases as well as `.nan`, `.inf`, `-.inf` and negative
zero. Original anchor nodes remain the lookup keys, so reused anchor names and
one resolution per external alias retain their existing behavior.

AST tag checks reject non-round-trip tagged collections before JS conversion,
including `!!pairs` (also empty pairs), `!!map`, `!!set` and tagged timestamps,
including through aliases. These values remain display-only and the set path
rejects attempts to strip their tags. Standalone draft validation and existing
recursive-alias / colliding-key guards remain in place.

B2's field value snapshot and raw-header transaction baseline are unchanged.
New units exercise the actual field-to-editor raw-text path, same-property and
comment-only concurrent changes, save-flush rejection, body-only changes and
combined displayed ordering. The Properties README and manual plan describe
the lossless draft behavior and display-only limits. No browser/native tests
were added, and the pinned source checkout remains unavailable and untouched.

Validation:

- Formatting, repository-wide ESLint and all seven TypeScript projects pass.
- Sequential direct `node --import tsx <test-file>` runs pass **134/134 tests
  across 23 Properties/YAML/Sources files**, including **43 YAML edit tests**
  and the existing NaN/Inf, reused-anchor, descendant-anchor and alias-resolution
  units. The B2 conflict regressions pass.
- The full direct unit fallback runs 1,386 tests in 271 files: 1,367 pass and
  19 fail in four unchanged subprocess-based test files. `protect-perf` child
  probes return empty output; `gitInline` child probes time out; the Git cache
  assertion in `gitDiffEditor/images` fails with `spawnSync git EPERM`; the
  `layers` child compiler probes return empty output. Their tests and source
  modules are unchanged by this patch.
- `node --import tsx scripts/generate-contributions.ts --check` passes.
  Production builds and native VSIX packaging pass.
- `xvfb-run -a pnpm check:full` reaches the unit runner after successful
  formatting/lint/types, then stops because `tsx` cannot create its IPC socket
  (`listen EPERM /tmp/tsx-1000/...pipe`). The direct unit runs above are the
  documented fallback; the full check is not green in this sandbox.
- Existing Chromium suite attempted separately: all 272 tests fail to launch
  Chromium before assertions (`sandbox_host_linux.cc`, `shutdown: Operation
  not permitted`). Existing native suite attempted sequentially on a private
  Xvfb display with the cached VS Code binary and its isolated `/tmp` profile:
  VSIX packaging succeeds, then setup cannot bind `127.0.0.1` (`listen EPERM`),
  before launching the test window. Neither suite is reported as passing.

Logs: `/tmp/pr49-{properties-direct,all-units-direct,check-full,typecheck,
contributions,browser,native}.log`. The full pre-push check remains required in
an environment that permits IPC, browser startup and loopback listeners.

Commit/push blocked: `git add` cannot create this worktree's `index.lock`
because its shared Git metadata is mounted read-only. Per the owner's run
instruction, the complete patch remains in this checkout, without stashing or
an alternate remote. HEAD remains `629e2a08c7484b5eba874c11ec4208badef5b428`;
the parent must commit and push `fix/sources-editable` to update PR #49. No
commit, push or merge occurred.

## PR #57 cursorBridge B1/B2 review fixes — 2026-10-15

Delivered: reclaim releases a handoff lease only when no native text tab for
the URI remains across all tab groups. Same-URI Workbench tab activation and
closure events cannot release it, and queued reclaim still honors it. Cursor
command discovery runs before handoff. The host adapter exposes live document
versions and selections and compares the mirrored native editor's identity to
the active TextEditor. A pure synchronous confirmation checks that identity,
URI, version, selected text and range again immediately before Cursor invocation.
Failed validation and exceptions during handoff release the lease; successful
command completion keeps it for the native session. Dirty buffers need no save.

Coverage: unit regressions cover sibling tab events, the last text tab closing
or switching to Markdown, text tabs in different groups, queued reclaim,
command-discovery ordering, changes after handoff validation, live host adapter
state and lease cleanup after failures/exceptions. No browser/native cases were
added.

Validation: focused handoff/reclaim unit tests
(`test/unit/cursor-bridge/handoff.test.ts`, `host.test.ts`,
`test/unit/editor/reclaim.test.ts`, `handoff-host.test.ts`) pass 56/56.
Live Cursor Edit/Accept/Reject remains an owner manual check.

## Mermaid stays rendered until explicit edit — 2026-10-15

Rendered Mermaid (and other `MarkdownBlock` widgets) collapsed to raw
`` ```mermaid `` source when the pointer interacted with blank diagram area
without an intentional Edit / click-to-edit commit.

Root cause: PR #46 set `ignoreEvent` to hand blank-area mousedown to CodeMirror
so selection drags could cross tall widgets. CM then placed the caret inside the
replace range; Live Preview `editing: "reveal"` showed source. A press that
ended outside the widget still left that caret, so click-away looked like a
collapse. CM's `MouseSelection` already listens on the document for move/up, so
drags that start outside do not need blank-area mousedown.

Fix: blank hybrid-block area keeps events again (with controls and Mermaid SVG
labels). Reveal still happens via click-to-edit mouseup, the Edit button, or a
caret that truly enters the fence. Copy/Edit alignment and SVG `user-select`
from PR #46 are unchanged.

Files: `src/webview/ui/markdown-widget.ts`,
`test/unit/webview/markdown-widget.test.ts`.

Validation: `pnpm exec tsx --test` markdown-widget + pointer-selection +
selection unit tests.

## PR #57 cursorBridge B1 pending-handoff clear race (r3) — 2026-10-15

Delivered: each handoff acquires a distinct pending lease token before warming.
Native editor confirmation promotes that token to an established session;
failure releases only its own token, including the caller's final synchronous
confirmation failure. Last-native-tab cleanup clears established tokens only,
so overlapping handoffs still warming or opening text continue to suppress
reclaim. Released or cleared tokens cannot affect a later retry. B2 command
discovery ordering and synchronous confirmation immediately before Cursor
invocation are unchanged; no B3 behavior changed.

Coverage: pure regressions pause handoff B in warm, clear A's established
session, then check reclaim suppression and B's success promotion or failure
release. Lease tests cover overlapping owners, repeated clear, stale tokens and
URI isolation. The host regression fires the last-native-tab close event while
B is pending and verifies both fresh and queued reclaim stay suppressed, then
checks that B's promoted session ends with its text tab. Existing sibling/custom
tab, cross-group, failed-retry and B2 tests remain. New coverage is unit only.

Validation: focused reclaim/handoff/host tests (`test/unit/editor/reclaim.test.ts`,
`handoff-host.test.ts`, `test/unit/cursor-bridge/handoff.test.ts`, `host.test.ts`)
pass 67/67. The two pure race cases failed before the fix and pass after it.
The full pre-push `xvfb-run -a pnpm check:full` was run. Formatting, lint and
all typecheck projects pass. Unit tests pass 1,393/1,394; the existing package
contributions test fails because the two Cursor command categories in
`package.json` say `Markdown Workbench` while the generator expects
`Markdown Workshop`. The package, generator and manifests are unchanged from
the starting HEAD; those two generated labels are outside this B1 fix.

Browser and native suites were then run separately, sequentially, on private
displays with the harness's isolated native profile:

- `xvfb-run -a pnpm test:browser`: 275/276 pass. The unchanged
  `Chinese punctuation: cell-local end, first nonblank and start` case in
  `test/browser/vim-line-keys.spec.ts` captures table source before its pending
  edit reaches the host, then compares against the later serialized table.
  It failed an isolated retry and passed 1/3 focused repeats. A temporary
  archive of the starting HEAD passed 4/4 focused runs; the browser harness
  bundles are identical after normalizing dependency paths and source comments.
  This is an intermittent synchronization assertion, with no browser or table
  code changed here.
- `xvfb-run -a pnpm test:vscode` (Code 1.142.0): the first 10 cases pass, then
  native focus checks fail. The run was interrupted after repeated focus
  failures and retried on a fresh private display with a window manager and
  disposable configuration. That full retry passes 3/23; the renderer crashes
  in `font-stack.spec.ts` and later cases report no live workbench page.
  Native validation remains incomplete in this environment; no native tests
  or harness code were changed.

New test names: `pending handoff survives session clear during warm until
success` / `failure`; `pending handoff survives the last text tab closing and
suppresses queued reclaim`; `session clear preserves pending tokens until they
are promoted`; `failed pending tokens release only themselves after session
clear`; `released and cleared tokens cannot revive sessions or release newer
owners`; `clearing one URI leaves other pending and established owners alone`.
The existing suppression and overlap tests now use per-handoff tokens, and the
failed-retry test also checks that no pending token remains after session clear.
## Git diff VS Code UX — 2026-10-15

Delivered: one semantic snapshot and hunk model for the change bars, inline
changes, and the rendered diff. The gutter peek is a raw unified diff, including
pure additions; Live Preview outside the peek stays rendered. Stage and Revert
go through a per-file mutation gate that requires the exact hunk and a matching
`sourceState`. A worktree comparison without `worktreeBytes` aborts both Stage
and Revert. There is no hunk-scoped stage API, so Stage stays disabled and never
falls through to whole-file `git.stage` or save-then-stage. A dirty buffer is
not saved or reclassified as disk in order to stage. Inline changes open that
peek from a Show Diff control; a text selection, link, or checkbox keeps its own
action. `gitInline` stays off by default. Open Full Diff uses the peek's
base → target sides, and `gitDiffEditor.diffEditor` still offers `native` and
`rendered`.

A bar mapped through a later edit still resolves the snapshot hunk by baseline
line and text, so Revert and Restore keep working. The click's snapshot is the
gate operand; the existing `resolveHunk` check still refuses a change that has
disappeared or grown. Nearest rematch is display-only.

Checks: `pnpm check` (1,476 unit tests passed, contributions check passed).
Git change-bar and inline Chromium specs 18/18. The full Chromium suite was
271/276: the five failures are pixel baselines and one previously recorded
intermittent table assertion (`font-size`, `stable-blocks`, `gutter-selection`,
`vim-line-keys` Chinese punctuation). Peek and Show Diff rules are class-scoped
and those specs do not open a git peek. `pnpm test:vscode` was not run: this
sandbox has no cached VS Code binary, and earlier native runs here lost the
workbench window. The native specs that assert the new title arrow and the
disabled Stage button are updated.
Deviations from the approved plan: none of the locked decisions. Stage stays
disabled because the host git adapter stages a whole file. Shared hashing is a
pure SHA-256, not `node:crypto`, so `src/shared` stays free of Node APIs.
Known issues: the five Chromium failures above; native suite not executed here.

## Git diff review fixes — 2026-10-15

A nearest peek rematch moves the display anchor and keeps the disappeared hunk's
ref, so Revert stays disabled and the gate aborts instead of editing the
neighbor. The same change payload (original range plus the non-context delete and add
lines) keeps its mutation ref when only context lines change its hunk id, so
an edit above a peeked hunk still reverts that hunk. A changed or grown added
payload does not: rematch keeps the stale ref, and a click that republishes
before the debounce does not mint a ref from the baseline alone. Production Revert reads the live
document version and baseline at gate time and applies the validated snapshot
hunk. An edit after the click and before execute changes that version and makes
no edit. Show Diff opens at the mapped decoration, not the snapshot anchor from
before the edit.

## Obsidian compatibility phase 1 — 15 October 2026

Adds the host-only `obsidianCompat` feature and scoped registry API. Pro B1–B4
are incorporated: aliases wire identity/unknown JSON preservation, last-good
reads and serialized conflict-checked writes; document/language-scoped full
inspect precedence; a separately configured contained profile folder; and
vault-keyed caches, watchers and async writes. Eight ranked app policies feed
the existing editor, index and commands through an in-memory provider, without
VS Code settings writes. Properties preference storage remains unchanged.

Unit tests and synthetic `.obsidian` fixtures cover the blockers and lifecycle;
the plugin README, design and manual acceptance plan describe the contract.
Plan 01 was updated at `/workspace/plans/pro-batch-2026-10-15/01-obsidian-compat.md`.
The pinned `~/Code/human-learning` checkout is absent; no reference source or
proprietary code/assets were copied. Work is isolated in
`/tmp/mdwb-obsidian-compat` because another task switched the shared checkout.
Validation results are recorded below before commit.

## PR #55 — Fail closed on Obsidian property-type writes, 15 October 2026

The final content comparison in `ContainedConfigFiles.writeTypes` could be
followed by an external Obsidian write before `writeText`, losing that writer's
unknown entries. The host's file API has no atomic conditional replacement;
moving a temporary file after another comparison leaves the same race. The
adapter now rejects all property-type edits as read-only before any filesystem
mutation, including directory creation, and the manifest no longer declares
file-write capability. The registry I/O contract explicitly
requires atomic replacement of the expected source or rejection without writing.
Reads, last-good snapshots, watchers, explicit VS Code setting precedence,
in-memory app policies and per-vault/profile isolation remain available. The
existing properties UI still uses its separate preference storage.

Unit coverage models A passing the final comparison, external B arriving before
the attempted mutation, and the A-derived edit rejecting with B preserved. It
also checks missing files/folders remain absent, deletion attempts retain the
snapshot, rejected edits leave the queue/watchers usable, and independent vault
work remains scoped during asynchronous reads. The generic registry tests use
an in-memory conditional writer and cover rejection without accepting a proposed
snapshot. README, service documentation, design and manual acceptance describe
the read-only fallback. No source tests were ported; the configured
`~/Code/human-learning` checkout is absent in this environment.

Validation: pending the required sequential local checks before commit/push.

## Outline Go to Heading (PR #45 review) — 2026-10-16

CustomTextEditorProvider webviews are not native Outline / Go to Symbol hosts
in the supported VS Code baseline, so the DocumentSymbolProvider registration
was removed. Workshop uses Markdown Outline and **Go to Heading…**
(Ctrl+Shift+O / Cmd+Shift+O) via the host Quick Pick adapter. Toggle Markdown
Outline uses the view's `.removeView` / `.focus` commands. The window plugin
publishes `markdownWorkshop.plugin.outline` for editor-scoped shortcuts;
Toggle uses `scope: "workbench"` config gating like Quick Switcher.

## Review fixes: macOS context menu and focus-scoped shortcuts — 2026-10-13

The owner reported that a two-finger click on macOS (VS Code and Cursor)
does not offer the selection items of the editor's context menu. VS Code
builds the webview menu from the clicked element's `data-vscode-context`,
read synchronously in the `contextmenu` event, but evaluates the items' `when`
against `markdownWorkshop.hasSelection`, which the webview reports through
the extension host to the workbench. On macOS, Chromium selects the word under
the pointer on a secondary click outside a selection
(`SelectionController::SendContextMenuEvent`) just before dispatching
`contextmenu`; CodeMirror reads that selection back on the next
`selectionchange`, so the menu always opened with the previous state. The
editor element now stamps `markdownWorkshop.hasSelection` into its own
`data-vscode-context` in a `contextmenu` listener, from the browser's selection
when it lies in the content and from CodeMirror's otherwise; VS Code's
per-menu overlay shadows the global key. The listener is a plain one on the
editor element (CodeMirror's handlers skip widgets) and the attribute is not
on the content element, whose attributes CodeMirror observes and restores.
`menu-context.test.ts` covers the decision; the macOS gesture is manual
scenario copyLinkForAgent 4, as Linux Chromium does not select on right-click.

Reviewing the keybindings showed a second defect: every note keybinding was
scoped by `activeCustomEditorId` alone, which VS Code keeps while focus is in
the Explorer, a chat input or a panel, and an extension binding outranks a
built-in one for the same key. With a note open, Mod+B in the Explorer bolded
the word at the note's caret (`runFeatureCommand` targets the active panel)
instead of toggling the sidebar, Mod+K swallowed every Mod+K chord, and in
Cursor Mod+I/Mod+K no longer reached its chat. The webview now reports its
window focus (`focus-report.ts`), the host keeps `markdownWorkshop.editorFocus`
for the active panel through the per-panel key helper that
`markdownWorkshop.hasSelection` now shares, and the generator ANDs that key
into every editor-scoped keybinding. Units cover the reporter and the generated
clauses; formatting scenario 3 and Vim scenario 2 cover the real workbench.

By owner decision, the editor's right-click menu keeps VS Code's own Cut, Copy
and Paste: the content no longer sets `preventDefaultContextMenuItems`, so
the menu starts with them as Obsidian's does (it already offered them outside
the content). They run the browser's clipboard commands in the webview, which
CodeMirror and `pasteHtml` handle as for the keyboard; table cells and
property chips keep their own menus. Editor scenario 7 covers it.

## PR #44 CodeSource freeze rebuild gate — 2026-10-15

Pointer and Vim visual freezes now suppress only selection-driven code-source
rebuilds. Viewport changes, syntax-tree changes and highlighter-ready effects
still rebuild decorations, so newly visible fences are decorated during visual
autoscroll. Composition still maps existing decorations and returns early.

Validation: 11 new unit tests pass for both freeze types, including viewport
changes with and without selection growth, syntax and ready updates, and
composition mapping. The original guard fails nine of those tests. Existing
code-block, visual-reveal, reveal-freeze, pointer-selection and selection units
pass. `pnpm check` passes format, lint and all typecheck projects, then hits the
sandbox's denied tsx IPC socket. Running units through Node's tsx loader passes
268/272 files; the four unrelated failures are subprocess/probe checks in diff,
Git images, Git inline and layer tests. Contributions checking and production
builds pass. Browser/native checks were attempted sequentially but blocked by
Chromium startup permissions, VS Code download DNS, and installed-editor setup.

## gitBlame Task 1 — Porcelain and shared types, 2026-10-15

Approved r5 Approach A implementation started on `feat/git-blame-current-line`.
Added shared snapshot/result/identity types and a porcelain parser. All-zero
SHA-1/SHA-256 OIDs alone mean uncommitted; boundary commits remain attributable.
TDD: module-missing red, then five parser cases green, including malformed input.
No source suites ported. The pinned human-learning checkout is absent on this
host; this feature is authored from the approved plan and local git patterns.
Native checks await clarification because their harness builds/installs a VSIX,
which the task explicitly prohibits.

## gitBlame Task 2 — GitAccess contract, 2026-10-15

Added required snapshot blame, identity and per-repository generation methods;
updated the typed gutter fake. TDD: the contract compile failed on absent API
members before the extension; its isolated compile now passes and all 20
contract/gutter cases pass. As approved in Task 2, NativeGitAccess implements
these methods in Task 3. Task 1 `pnpm check` passed 1,578 cases; the browser run
received SIGTERM after 222 passing cases with no assertion failure. The full
browser gate will be rerun after integration. No VSIX built or installed.

## gitBlame Task 3 — Native snapshot blame, 2026-10-15

Added a real stdin-capable Git runner with timeout, bounded stdout/stderr and
pipe-error handling. Dirty snapshots always use `--contents -` against HEAD;
clean callers can use the path-only route. NativeGitAccess rejects non-file or
outside-repository paths, soft-hides over-cap/failing blame, and caches identity
by repository generation. RepositoryWatch is the production binding shared by
all observers: one advance before fan-out, including open/close and enablement.
Watch subscriptions are released after the last observer/request exits.
TDD: module-missing red, then 16 native/parser cases green; the production
watcher helper proves mid-request stale and identical generations for two
subscribers. Full typecheck and scoped lint pass. No VSIX built or installed.

## gitBlame Task 4 — Validated host RPC, 2026-10-15

Added the quiet, default-on manifest and panel-bound blame/identity RPC. Changed
notifications carry required authoritative generation immediately; the host
only reads that counter. Contents use MAX_DIFF_CHARS in both schema and handler.
The local kernel has no `.int()` or schema-valued unions, so custom Schema
validators enforce safe integer/version and required blame on ok responses.
TDD: missing-module red followed by four host cases green, including real schema
over-cap rejection, handler defense, immediate notify and disposal. Scoped lint
and host plugin compilation pass. No VSIX built or installed.

## gitBlame Task 5 — Panel freshness controller, 2026-10-15

Added B2 epoch helpers, transaction-owned blame/version fields and a panel-local
controller with an injectable scheduler. Every invalidation clears immediately;
only re-request is debounced 150ms. URI and disable invalidate serial as well as
timers. Success/rejection share the current-request guard. A still-current
response may adopt host generation; intervening changed cannot be adopted over.
TDD: missing-module red, then all 11 state/controller cases green, including
late URI/disable ok, obsolete rejection preserving R2, same-line no-op, current
reject/over-cap soft-hide and startup/re-entry behind the host. Scoped lint and
webview plugin compilation pass. No VSIX built or installed.

## gitBlame Task 6 — EOL ghost and formatting, 2026-10-15

Added one non-block widget at the caret line end, using plain text, aria-hidden,
and no pointer/selection capture. Description foreground/muted styling stays
separate from diff tints, restores opacity under forced colors, and hides in
Source mode. Formatting covers You by email/name, English relative buckets,
first-line subjects capped at 48 graphemes plus ellipsis, and empty fallbacks.
Identity responses have their own latest/lifetime guard and redraw current
blame without another blame process. TDD: missing modules red; all 21 formatting,
widget and epoch cases pass; scoped lint and webview compilation pass. No VSIX
built or installed.

## gitBlame Task 7 — Catalog, settings and coexistence, 2026-10-15

Registered both halves, ordered EOL chrome after gitInline, generated the single
`markdownWorkshop.plugins.gitBlame.enabled` switch (default true), and documented
the plugin plus owner-run acceptance scenarios. TDD: absent catalog/order red,
then all 46 focused blame cases pass, including actual webview registration
with/without gutter and independent teardown. All 53 selected feature lifecycle,
order and contribution cases also pass. Full `pnpm typecheck`, `pnpm lint` and
`pnpm contributions` pass. On Node 20 the requested directory-form tsx command
finds zero tests; the verified run uses explicit `*.test.ts` globs. No source
suites ported and no VSIX built or installed. Full integration gate follows.

## gitBlame review fix — Path-only worktree attribution, 2026-10-15

A post-integration real-Git regression showed that the optional known-identical-
to-disk route returned committed attribution for a dirty worktree line because
it explicitly named HEAD. Removed that revision only for the path-only route,
so Git includes working-tree edits. The production snapshot route continues to
send stdin against HEAD. TDD: the new dirty-disk case failed with ok, now returns
uncommitted; all 47 focused cases pass. No VSIX built or installed.

## gitBlame integration checks — Inventory and Node events, 2026-10-15

The first final full check passed formatting/lint/typecheck but exposed two
integration failures: the setting lacked a parity inventory row, and the event
catalog audit interpreted literal Node EventEmitter events as kernel events.
Added parity/capability rows and a Node-process event helper in the runner fake;
the existing audit stays unchanged. All 58 focused blame/audit/settings cases
now pass. Native packaging remains prohibited by this task. An unpackaged test
harness option was prototyped and unit-checked but removed from the shared
checkout externally; it is not part of this branch. No VSIX built or installed.

## IDE context real host APIs and safe Codex attachment — 2026-10-15

Replaced MW and PDF's tab/diagnostic stubs with the same injectable VS Code
facade. It enumerates supported text/custom tabs, orders visible active tabs by
focused group, deduplicates URIs, maps canonical diagnostics and snapshots native
caret/language/dirty and workspace metadata. Panel selection stays authoritative.
Tab/diagnostic failures are isolated; gather also records a throwing tab API as a
bounded warning. All 13 shared IDE-context files, including `host-apis.ts`, are
byte-identical with PDF and pinned in both suites.

Codex now receives a file URI string on every attachment attempt. Drive and UNC
paths work independently of the test host's platform; native paths use
`node:url`. The file-URI helper lives beside each product's delivery code rather
than under shared, because the pure-layer compiler and linter prohibit Node
imports there. The two helpers are byte-identical. URI scrubbing now separates
fragments from queries, handles encoded secret keys and malformed encodings, and
escapes question marks in truncated tails so a second scrub cannot reinterpret a
fragment. Existing diagnostic redaction remains stable, including empty messages.

TDD reproduced missing adapter, fragment/query and Windows attachment failures
before the fixes. Unit coverage adds mixed/duplicate/unsupported tabs, failure
isolation, diagnostic mappings, native snapshots, URI encoding and scrub
idempotence. Requested focused suites: MW 62/62; PDF 49/49. Prettier was applied
to touched files. New adapter/helper code and changed host/gather/scrub pass scoped
lint. No source tests were ported; the pinned human-learning checkout is absent.

Broader checks are blocked by the starting branch: `xvfb-run -a pnpm check:full`
stops at 70 lint errors. An archive of starting commit `0404792` has 79 lint errors and the
same 16 pure-project TypeScript errors (optional fields, Buffer and
structuredClone). Host-project compilation confirms the new facade accepts real
VS Code types; the existing temp-FS/selection errors remain. The full existing
Chromium suite finishes 5/276 passing, with feature startup failing on an undefined
plugin (`reading 'inject'`). A focused unchanged browser case in the starting
archive reproduces the identical stack. No browser/native tests were added.
Native setup packages a VSIX, so it was excluded by the task's explicit no-VSIX
constraint. No cursorBridge code, PDF bridge defaults, VSIX, merge or Marketplace
publication is part of this phase. PDF check results and final pushed tips are
recorded in `/workspace/plans/chatgpt-ide-adapters-code/PR-STATUS.md`.

### Cordis Stage 1 — Blocking review fixes F1/F2, 2026-10-12

- Added canonical `late-drain-disable-success`, `late-drain-disable-error`,
  `late-drain-dispose-success`, and `late-drain-dispose-error` scenarios. Each
  introduces A during ordinary cleanup and B after cleanup begins waiting on A;
  both stop callers stay pending until B completes, including when B rejects.
- Added `transitive-provider-disable` with leaf/provider/consumer declaration
  order and an independently gated leaf inverse. Provider disable alone must
  start and join leaf cleanup while both backing services remain usable; these
  assertions run before fixture disposal. The original dependency/LIFO and
  cancellation cases remain.
- Synced all six shared files with the canonical suite and PDF snapshot. The
  matrix is now 23 scenarios. The Markdown native adapter passes all 23; the
  Cordis stub skips all 23 and still refuses activation in its smoke test.
  Markdown's existing `Fiber.dispose()` barrier is unchanged. No Stage 2 work,
  dependency installation, merge, push, or publication was performed.
- Verification (unrestricted local): focused conformance green (24 pass / 23
  Cordis skips); full `pnpm check` green (911 pass / 23 skip). Markdown runtime
  needed no code change for F1/F2; existing `Fiber.dispose()` barrier kept.
  Browser/native gates unchanged by this patch and not re-asserted here.


### Cordis Stage 1 — PR #17 main rebase and local readiness, 2026-10-16

- Rebased the five PR commits onto `origin/main` (`bbfea4f`), preserving both
  histories' implementation records when resolving the documentation conflict.
- Restored the Stage 1 skip-all Cordis stub, refusal smoke test and explicit
  per-scenario reasons. Removed the Cordis dependency, characterization adapter,
  expectation matrix and reference target. Kept all 23 lifecycle scenarios,
  timeout/abort/error-reporting meta-tests and the `Fiber.dispose()` stop barrier.
  Production continues to use the native kernel.
- Added opt-in unit-worker limiting for busy shared hosts and unpackaged native
  loading through `--extensionDevelopmentPath` in the isolated test profile.
  Default test modes remain unchanged; no deadlines or assertions were weakened.
- Repaired existing UI test synchronization: Revert lookup/click is atomic when
  recomputation removes the peek; Vim table-motion tests await the authoritative
  whitespace edit before capturing their baseline; native focus recovery clicks
  neutral workbench chrome when window activation leaves its document unfocused.
  No browser/native scenarios were added or ported.
- Verification: `MARKDOWN_WORKBENCH_TEST_CONCURRENCY=2
  MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1 xvfb-run -a pnpm check:full` passed in order:
  check (1,743 unit passes, 23 intentional Cordis skips), Chromium (276 passes),
  native VS Code 1.142.0 (23 passes). Focused repairs also passed Revert 3/3,
  Vim table variants 12/12, and the native Git sequence 2/2. Earlier fuzz deadlines
  under shared-host load passed unchanged with bounded workers.
- `pnpm package` and the existing 10 MB VSIX size/file check passed (4.66 MB).
  The VSIX was only built locally; no installation, merge or publication occurred.

## gitBlame follow-up — Live Preview panel host wiring, 2026-10-16

The panel host feature list omitted `gitBlameHost`, despite its manifest and
bundle export. The webview's default-on renderer therefore received
`PluginDisabled` for its blame/identity requests and quietly hid the EOL chip.
Registered the host beside `gitGutterHost` through the existing resource-scoped
enablement path; no catalog-loader or rendering change is needed.

Added a unit regression through the real `hostFeatures` entry point and paired
RPC endpoints. It checks default startup, panel-document binding, disable and
re-enable, repository subscription cleanup and the minimal preset. Before the
fix it fails on `gitBlame/blameLine` with `PluginDisabled`; after the fix,
focused gitBlame/git-blame units (48/48) and `pnpm check` (1,744 unit passes,
23 intentional Cordis skips) are green under Node 22. Sample-vault GUI
acceptance remains VERIFY-NEEDED for Grok Bot; the existing manual plan already
covers the behavior. No source suites ported and no VSIX, merge or Marketplace
publication.

## gitBlame follow-up — Filesystem root when vscode.git is empty, 2026-10-16

GUI verify on tip `7d1c067` still painted no EOL chip. The Extension Host had
registered `gitBlameHost`, but `vscode.git` logged `repositories (0)` for an
empty window (`isEmptyWorkspaceTrusted`) while `00-home.md` was opened as a
loose file. Default `git.openRepositoryInParentFolders: prompt` never opened
sample-vault, so `getRepository` stayed null and blame soft-hid as
`unavailable`.

`NativeGitAccess` now falls back to `git rev-parse --show-toplevel`
(`discoverGitRoot`) for blame and identity when the API has no repository.
Prefer the open API root when present. Unit regression covers discovery from a
nested path and blame using only that root. Focused gitBlame/git-blame units
49/49; `pnpm check` 1,745 unit passes, 23 intentional Cordis skips (Node 22).
No VSIX or merge.

## gitBlame follow-up — Discovered-root RepositoryWatch enrollment, 2026-10-16

Codex re-review of tip `a22ea91` REQUEST CHANGES'd one P2: discovered roots
only wrote `rootsByUri` and never enrolled in `RepositoryWatch`, so an
empty-window chip could keep stale attribution after a terminal amend without
a note edit (no generation advance / `changed`), and identity cache keyed by
generation stayed warm across disable/re-enable for that root.

`RepositoryWatch.enrollDiscovered` plus `bindDiscoveredRoot` (Node `fs.watch`
on `.git` HEAD/refs/config/logs) give discovered roots the same lifecycle-
managed invalidation as API repositories. `NativeGitAccess` enrolls on
discovery and clears FS bindings with API watches on detach/enablement.
Unit regressions cover enroll/invalidate and a real amend without note edit.
Follow-up hardening: directory (not file) watches so atomic `config` replaces
keep firing; linked-worktree `commondir` watch; `identity` retains the watch
lease; symlink roots use `canonicalPath` for containment. No VSIX or merge.

### Markdown Outline display labels — 2026-10-16

- Named the heading tree **Markdown Outline** and its command **Toggle Markdown
  Outline**. Updated setting descriptions, generated contributions, documentation,
  comments and existing test strings. Plugin, view, command and setting IDs remain
  unchanged. Synced the identity allowlist with the updated documentation.
- The contribution unit test also checks the view title under the existing
  `markdownWorkshop.outline` ID; the existing native outline scenario uses the new
  accessible section name. No browser or native scenarios were added.
- Validation: `MARKDOWN_WORKBENCH_TEST_CONCURRENCY=2
  MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1 xvfb-run -a pnpm check:full` passed in
  order under the shared suite lock: check (1,743 unit passes, 23 intentional
  Cordis skips), Chromium (276 passes), native VS Code (23 passes). Native loading
  used the cached VS Code 1.142.0 executable and a disposable profile; no VSIX was
  built or installed. The generated package differs only in the four display
  strings, and a case-insensitive search including wrapped lines found no old
  panel-label references.
- Post-PR GUI label confirmation and the PR link are tracked in
  `/workspace/plans/mw-indent-guides/STATUS-outline-rename.md`.
- Additional identity audit: `bash scripts/check-identity-rename.sh` reports one
  unchanged baseline hit at `test/unit/gitBlame/coexistence.test.ts:41`, a negative
  assertion that the old setting key is absent. That line is identical at base
  `2e87720`; this label rename introduces no identity-audit hits.

### Workshop product-copy sweep — 2026-10-16

- Updated current product wording in the README, outline/wiki plugin READMEs,
  manual test plan, parity/design docs, product comments and existing test titles.
  The manual inventory generator now writes the current Workshop result header.
- Renamed the Marp keep command to `markdownWorkshop.marp.keepInWorkshop` in its
  manifest, runtime registration and command inventories. The displayed command
  remains **Keep Marp Deck in Workshop**. There is no compatibility alias.
- Generated contributions keep the **Markdown Workshop** configuration title and
  command categories. The earlier Settings screenshot is consistent with a stale
  installed extension. Grok Bot owns fresh host installs and GUI confirmation,
  tracked as VERIFY-NEEDED in the external outline-rename status file.
- Validation: `MARKDOWN_WORKBENCH_TEST_CONCURRENCY=2
  MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1 xvfb-run -a pnpm check:full` passed in
  order under the shared suite lock: check (1,743 unit passes, 23 intentional
  Cordis skips), Chromium (276 passes), native VS Code 1.142.0 (23 passes).
  Native loading used the cached executable and a disposable profile. Existing
  command-registration parity passed; no browser/native scenarios were added.
  The generated package differs only in the Marp command ID and its palette entry;
  configuration title and every command category are **Markdown Workshop**.

### Nested-list indentation guides — 2026-10-16

- Fixed competing guide systems: source-column `ch` backgrounds were painted
  beneath list whitespace that Live Preview replaces with fixed `1.6em` steps,
  while list spacer widgets painted another set. The indentGuides plugin now
  owns list-row backgrounds using the renderer's existing depth/step variables,
  including soft wraps, and its owned editor class gates all guide painting.
- Source-column guides are excluded from parsed list prose in Live Preview,
  including separate continuation lines, whose layout the renderer does not
  normalize. Code blocks, quoted lists, non-list indentation and Source mode
  retain their previous source-column behavior. No document edits or list-layout
  changes are introduced.
- Added six pure unit cases for tabs, ordered/task nesting, continuations and
  code/quote preservation. One inexpensive regression in the existing Chromium
  layout harness checks marker/guide geometry, soft wraps, Source-mode round
  trips and disposal. It fails against the original production files with three
  duplicate source-guide rows and passes with the fix. Manual acceptance and the
  plugin README document the continuation-line limit.
- The pinned `~/Code/human-learning` checkout is absent on this host. No source
  suites or proprietary assets were copied; no ledger retirement is needed.
- Validation: Node 22.20.0 with `MARKDOWN_WORKBENCH_TEST_CONCURRENCY=2
  MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1 xvfb-run -a pnpm check:full` passed in order:
  check (1,749 unit passes, 23 intentional Cordis skips), Chromium (277 passes),
  native VS Code 1.142.0 (23 passes, disposable profile). Focused units (9/9,
  including existing list tests), scoped lint and Chromium layout tests (2/2)
  also passed. Synthetic before/after screenshots are in
  `docs/images/indent-guides-{before,after}.png`. The native suite's unrelated
  regenerated screenshots were restored. No VSIX was installed; no Marketplace
  publication or merge was performed.
### Faster configurable text-selection drag scroll — 2026-10-16

Investigated both drag paths: CodeMirror 6.43.14 owns main-note mouse selection
and scrolls by 8 px per 50 ms near an edge (160 px/s), while tables and property
ordering already use the faster shared `EdgeScroll` helper. Added resource-scoped
`markdownWorkshop.editor.dragScrollSpeed` (number 1–10, default 4); 1 restores
CodeMirror's original speed. The editor's validated config/RPC and settings
compartment carry updates without recreating the view or selection.

A public mouse-selection-style observer starts extra animation-frame scrolling
using `EdgeScroll` with an injected velocity curve. It adds only the requested
motion above 1x, leaving CodeMirror's timer responsible for selecting, including
word/line, Shift/Mod and atomic-range behavior. Release, cancellation, blur,
native text drag, typing and view disposal release the extra frames/listeners.
Table selection/handles and property reordering keep their existing curve.
README, editor documentation, settings/parity inventories and manual Editor
scenario 8 describe the range, scope and owner-run feel/selection checks.

New unit coverage checks config and RPC boundaries, curve scaling, stationary
dragging, both axes, live changes without replacing text/selection, and gesture
cleanup/isolation. Host settings coverage includes the shared settings contract,
defaults, resource reads and generated scope. The existing gutter-selection
Backspace assertion now waits for the authoritative host text, matching the
other operations in that file; its failure snapshot showed the local deletion
before the test read the host's previous text. No expected value or test deadline
changed. No source tests were ported and no browser/native scenarios were added.
The pinned `~/Code/human-learning` checkout is absent on this host;
investigation used this checkout and the installed CodeMirror dependency.

Validation: focused editor/settings/shared-helper units pass (27/27), and the
existing fence/gutter scenarios pass five repeats per mode (10/10). A disposable
Chromium diagnostic held the pointer still near the bottom edge for 0.8 s in
Live Preview and Source mode: 1x moved 128 px, 4x moved 512 px, and 10x moved
1,272–1,280 px. Selections extended with stable anchors, mouseup stopped scrolling,
and no page errors occurred. This is automated evidence, not owner acceptance.
The required sequential full gate passed with
`MARKDOWN_WORKBENCH_TEST_CONCURRENCY=2 MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1
VSCODE_EXECUTABLE=/workspace/worktrees/mw-indent-guides/.vscode-test/vscode-linux-x64-1.142.0/code
xvfb-run -a pnpm check:full`: check (1,757 unit passes, 23 intentional Cordis
skips), Chromium (276 passes), native VS Code 1.142.0 (23 passes). The initial
native launch used an incomplete cached host; the final run used a verified
complete executable with the harness's private profile and display. Native checks
used the existing unpackaged mode; no local VSIX was built or installed. Generated
native screenshots were restored. Raw gate and diagnostic logs are in
`/workspace/plans/mw-indent-guides/`. Default feel and Obsidian parity remain owner
acceptance.
## Scrollbar keeps Live Preview — 2026-10-16

The confirmed path is missing viewport inline decorations while Live Preview
remains active, rather than a mode or native-editor switch. The pointer tracker
captures `mousedown` on the entire editor DOM, including the note scrollbar.
`HybridInline.update` then mapped only the previous viewport's decorations for
as long as the pointer reveal freeze stayed active. Newly visible headings,
links, emphasis and fences therefore showed their Markdown syntax. Document-wide
block decorations (including rendered tables) could remain, matching the mixed
rendered/source appearance in the owner's screenshot. Reclaim, RevealRouter,
scroll restoration and scroll persistence have no scrolling-to-Source call path.

Allow viewport changes to rebuild inline decorations using the existing frozen
reveal ranges. Selection-only pointer updates still map decorations, composition
still maps even on viewport changes, and release reveals the live selection as
before. Name the existing view-plugin class for direct unit coverage. No editor
mode, native navigation, protocol, dependency or setting changes.

Five unit cases cover held scrollbar paging in both directions, selection
extension into a new viewport and release, selection-only decoration stability,
ordinary viewport changes, and IME mapping. Update the Live Preview README and
add the owner-run scrollbar/scroll-arrow/track, wheel, PageUp/PageDown, Vim and
Cursor scenario to the manual plan. No browser/native tests or source suites
were added or ported. The pinned `~/Code/human-learning` checkout is absent;
only this checkout and its installed CodeMirror source were inspected.

Validation: the original update gate failed the two new viewport/freeze cases
(missing rendered heading); the other three cases passed. With the fix, the five
regression cases pass. Under `/tmp/markdown-workshop-test-suites.lock`,
`MARKDOWN_WORKBENCH_TEST_CONCURRENCY=2 MARKDOWN_WORKBENCH_TEST_UNPACKAGED=1
xvfb-run -a pnpm check:full` passed in order: formatting, lint, all TypeScript
projects, 1,748 unit passes (23 existing intentional Cordis skips), contributions
check, 276 Chromium passes and 23 native VS Code 1.142.0 passes. Native tests used
a complete private runtime in this worktree's ignored `.vscode-test`, a private
Xvfb display and the harness's disposable home/profile/extensions directory.
No VSIX was created or installed. Cursor-specific manual acceptance remains
owner-run.

Optional read-only local `codex review` (gpt-6.1-sol, xhigh) found no blocking
correctness bugs in the viewport/freeze, release or composition paths. It ran no
tests or builds and made no changes.
## Table wheel feel from the first tick — 2026-10-16

The table widget's vertical wheel handoff used an immediate `scrollBy`, while
ordinary prose used Chromium's native wheel scrolling. Forwarded ticks now use
native smooth scrolling from their first event. One motion destination belongs
to the tables plugin in each panel and is injected into its widgets, so rapid
ticks accumulate their full distance even before the first frame. Reversals
start at the visible position. Other wheel/input gestures, selection/document
navigation and disposal cancel pending motion; reduced-motion preferences keep
immediate movement. Existing gesture guards, delta units and note-edge chaining
remain in the table router.

Nine new unit cases cover first/later ticks, fractional bursts, reversal, limits,
interruption, changing geometry, reduced motion and independent panels. The
existing plugin lifecycle unit also exercises input interruption and disposal.
The existing two selected-row browser scenarios await the full wheel distance
before reversing or checking the horizontal axis; no browser/native scenario
was added. The Tables README and manual acceptance steps cover the behavior.

One-off measurements used the original `2e87720` build and the changed build in
Chromium 156.0.8078.4 with native smooth scrolling enabled, on a private Xvfb
display with OS wheel-button events.
The original table tick moved 120 px synchronously, versus zero synchronous
movement and a 3 px first animation step after the fix. Three isolated table
ticks changed from three scroll samples to 30; a rapid three-tick burst retained
all 360 px. A stationary-pointer table-to-prose crossing reproduced the original
jump followed by native animation, and animated throughout after the change.
Native prose already animated from its first tick. Immediate pane-restore cases
showed the same table/prose distinction; EdgeScroll and a velocity warm-up were
not involved in this reproduction.

Focused checks pass: 61/61 affected feature, command and wheel units, plus the
existing table wheel Chromium scenarios 2/2 (Vim on/off). The shared state-only
feature fixture now models panel/scroller event targets for the owned listeners,
preserving the existing lifecycle/composition and command-registration checks.
`pnpm check` and the Chromium suite pass (1,752 unit passes, 23 intentional Cordis
skips, 276 Chromium passes). Native startup exposed an incomplete pre-existing
VS Code cache; the full gate is queued again using a verified complete private
1.142.0 runtime, a private Xvfb display and unpackaged native loading.
No source suites were ported. The configured pinned `~/Code/human-learning`
checkout is absent on this host. This is separate from the scrollbar/preview
follow-up and changes the table wheel handoff only; no sibling worktree or drag
EdgeScroll implementation is part of this phase.
