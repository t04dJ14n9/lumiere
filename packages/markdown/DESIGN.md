# Lumière — design and architecture

Status: design, 7 October 2026. Audience: the agent implementing it (Codex)
and the owner reviewing it. Read this document, then
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), before writing code.

Lumière is a VS Code and Cursor extension that edits Markdown the
way Obsidian does: one CodeMirror 6 surface in Live Preview, where Markdown
renders in place and reveals its syntax around the caret. It is extracted from
LLM Wiki for VS Code (`~/Code/human-learning`), as PDF Workbench
(`~/Code/vscode-embedPDF`) was. It is rebuilt around one idea taken from
[DeepSeek Harness](https://deepseek.com/harness/en/) and its
[Cordis](https://github.com/cordiverse/cordis) kernel: **everything is a
plugin**.

## 0. Decisions at a glance

| Topic | Decision |
| --- | --- |
| Identity | Display name **Lumière**, one half of the extension **Lumière: Markdown Editor and PDF Reader** (package `lumiere`, publisher `t04dj14n9`, extension ID `t04dj14n9.lumiere`); editor view type `lumiere.markdown.editor`; settings, commands and context keys under `lumiere.markdown.` |
| Source to extract | `claude/markdown-integration` at `ff3a902ef4ec50a136455c0cf2ccaff698682a06` in `~/Code/human-learning`. Not `main`, whose 4,900-line `webview-src/markdown-editor.ts` it supersedes |
| Architecture | `@workshop/core` (on Cordis) runs in the extension host, in each webview and in unit tests. Every capability, the core ones included, is a plugin that injects services, provides services, owns effects and extends others through typed events |
| Behaviour reference | Obsidian 1.13.7 as observed, plus the 1.12.7 source study. Implement behaviour independently; never copy Obsidian code |
| Document authority | The VS Code `TextDocument` is the only source of text, saving and undo. Webviews are synchronized views (`@codemirror/collab`) |
| Markdown dialect | Obsidian Flavored Markdown is one fixed dialect, parsed identically everywhere. Plugins change presentation and interaction, never parsing (as in Obsidian) |
| Vault model | One host-side vault index (Obsidian's MetadataCache) replaces the three link resolvers and four whole-workspace scans in the source |
| Host/webview contract | Typed RPC with validated schemas both ways. Plugins get namespaced channels; no hand-rolled request-ID maps |
| Outside extensions | API v1: host plugins loaded through the API into an isolated context, plus data-only webview contributions (markers, actions, rendered code blocks). Webview code modules from other extensions are a designed v2 extension point |
| Template | Mirror PDF Workbench: single package, `pnpm`, esbuild, `pnpm check` / `test:browser` / `test:vscode`, generated `contributes`, frozen versioned API, `API.md`, `CAPABILITIES.md` |
| LLM Wiki | Not migrated in this project. LLM Wiki keeps its editor until a separate migration decision. Its Query badges and source links map onto API v1 (§18.4) |

Open questions for the owner are in §25. Each has a recommended default, so
work need not wait for answers.

## 1. Goals and non-goals

Goals:

1. A standalone extension whose Markdown editing matches Obsidian's Live
   Preview: same syntax, reveal rules, links, properties, tables, callouts,
   footnotes, embeds, commands and defaults (§13–§15).
2. Everything is a plugin. Turning a feature off, swapping a service or adding
   a third-party extension uses one mechanism. Features stay independent: a
   failure stays inside its plugin, and code depends on interfaces, not
   modules.
3. Code that reads well. Each module has one job and states it. Each plugin
   has a short README. No file exceeds about 400 lines (the source's
   `table/controller.ts` at 952 lines must be split). One way to do each thing.
4. No regressions against the source branch's behaviour: its unit tests still
   pass where the behaviour exists, and its browser and native scenarios are
   covered by the owner's computer-use acceptance pass (§21).
5. A versioned API that lets LLM Wiki (and others) add Query markers, source
   links, actions and code-block renderers without forking the editor.

Non-goals for v1:

- Reading view (Obsidian's rendered, read-only mode). Live Preview and Source
  mode only. The plugin model leaves room for it.
- Canvas, graph view, Bases, Sync, Publish, templates, daily notes.
- Plugins that change the Markdown grammar (Obsidian does not allow it either).
- Markdown linting, Git diff gutters, LLM Wiki Queries, anchors, exports,
  agent chat handoff, repository cards. These stay in LLM Wiki.
- Embedding the PDF viewer in notes. PDF embeds show a card that opens the PDF
  with whatever editor VS Code associates (PDF Workbench when installed).
- VS Code for the Web. The extension host uses Node `worker_threads`.

## 2. Source material

| Material | Location | Use |
| --- | --- | --- |
| Editor package | `packages/markdown-editor/` at the pinned commit | Main code to port (about 18,000 lines of source, 10,000 of tests) |
| VS Code adapter | `packages/vscode-extension/src/markdown/{provider,rename-note,webview-html}.ts` | Custom editor provider, rename, HTML/CSP |
| Host features | `packages/vscode-extension/src/{backlinksProvider,markdownSymbols,linkProvider}.ts` | Backlinks, outline and document links, to rewrite over the vault index |
| Native tests | `packages/vscode-extension/test/vscode-e2e/{markdown,properties,file-title,rename-state,obsidian-commands}.spec.ts`, `fixtures/test-vault/` | Installed-extension scenarios to port |
| Status and evidence | `docs/markdown-integration.md`, `docs/markdown-integration-handover.md` on the branch | Tested behaviour, known flakes, open acceptance items |
| Obsidian study | `~/Code/human-learning/docs/obsidian-1.12-source-study.md` (untracked, main checkout) | Architecture of MetadataCache, link resolution, Live Preview engine, fuzzy scoring |
| Obsidian reference | Obsidian 1.13.7 in `/Applications`; extracted bundle in `~/Code/obsidian-re/` | Behaviour reference only. Proprietary: never copy code or assets |
| Template | `~/Code/vscode-embedPDF` | Repository shape, catalogue-generated settings, API style, test tiers |
| Plugin model | DeepSeek Harness and Cordis (links above) | Context, inject, services, effects, events, fibers |

Read the source with
`git -C ~/Code/human-learning show ff3a902e:<path>` or a `git archive` of the
commit into the scratch directory. Do not edit any human-learning worktree.

## 3. Principles

1. **One authority per fact.** Text, saves and undo belong to the
   `TextDocument`. Presentation state (folds, scroll, disclosure) belongs to the
   view. Vault facts (files, links, tags) belong to the vault index. Settings
   belong to VS Code configuration.
2. **Everything is a plugin.** If it can be named, it is a plugin with an ID,
   a lifecycle and declared dependencies, including the document session, the
   editor view, the dialect and the vault index. Bootstrap code only creates
   the root context and loads a preset.
3. **Dependencies are declared, not imported.** A plugin reaches another
   capability through an injected service or a typed event, never by
   importing another plugin's module. Only `kernel`, `shared` and `markdown`
   are importable by every plugin; webview halves may also use the DOM helpers
   in `src/webview/ui`. A lint rule enforces this.
4. **Effects are owned.** Every registration (command, listener, decoration
   source, CodeMirror extension, tree view, timer) is created through the
   plugin's context and undone when its fiber stops. No global mutable
   registries outside the kernel.
5. **The webview is untrusted.** Every message is validated against a schema
   before use, in both directions. The host checks paths and containment again.
6. **Obsidian is the behaviour reference.** When behaviour is in doubt, check
   the reference app and record the observation (§21.4). Deliberate
   divergences are listed in §15.3.
7. **Pure core.** `packages/core`, `src/shared` and `src/markdown` use no DOM,
   VS Code or Node APIs and are covered by fast unit tests.

## 4. System overview

```text
┌──────────────────────── VS Code extension host (Node) ────────────────────────┐
│ host bootstrap ─► root Context ─► preset "obsidian"                            │
│   runtime services: transport, settings, logger, workbench (VS Code adapter)  │
│   core plugins:  document · editor · dialect · vault · resources · commands   │
│   feature plugins: properties · links · tags · backlinks · outline · …        │
│   api plugin ─► isolated child Context ─► host plugins of other extensions    │
│        │  ▲                                  workers (worker_threads):         │
│        │  │ typed RPC per panel              vault.cjs (metadata), search.cjs │
└────────┼──┼────────────────────────────────────────────────────────────────────┘
         ▼  │ postMessage (validated envelopes)
┌──────── webview (Chromium), one per editor panel ─────────────────────────────┐
│ webview bootstrap ─► root Context ─► plugins the host says are active         │
│   runtime services: transport, logger                                         │
│   core plugins:  document (collab) · editor (EditorView) · dialect ·          │
│                  livePreview · render                                          │
│   feature plugins: properties · tables · callouts · math · vim · …            │
└────────────────────────────────────────────────────────────────────────────────┘
```

A plugin with both halves shares one ID, one manifest and one protocol. The
host decides whether it is active for a given document (settings are
resource-scoped) and tells each webview which halves to run and with what
configuration.

## 5. The plugin core

`packages/core` (`@workshop/core`) runs every plugin of both products, in the
extension host, in each webview and in unit tests. It sits on
[Cordis](https://github.com/cordiverse/cordis) 4.0.0-rc.11 (pinned exactly):
each running plugin is a Cordis fiber, gated on the services it injects. The
core adds what Cordis does not guarantee (joined, last-first release;
abandoning a start; optional services; a ranked, error-isolated event bus;
an ownership tree) and is checked by 23 lifecycle conformance scenarios.
§5.9 explains the move; `packages/core/README.md` is the reference.

### 5.1 Concepts

| Concept | Meaning |
| --- | --- |
| **Context** | The handle a plugin works through: services, effects, events, child plugins, logger. Each start of a plugin (an *activation*) has its own context; stopping it undoes everything done through it |
| **Plugin** | A name, the services it reads (`inject`) and publishes (`provides`), an optional config schema and an `apply(ctx, config)` function |
| **Plugin handle** | A started plugin, as `ctx.plugin()` returns it: state, config, `waitingFor`, `update`, `dispose` |
| **Service** | A named object a plugin publishes (`ctx.vault`). Withdrawn when the plugin stops. Root contexts publish the host services |
| **Effect** | A side effect with a disposer, owned by an activation and undone in reverse order |
| **Event** | A typed, named hook with a dispatch mode (§5.5). Listeners are effects |

### 5.2 API

```ts
// packages/core/src/types.ts — Services and Events grow by declaration merging
export interface Plugin<Config = void> {
  readonly name: string;
  readonly inject?: { required?: readonly ServiceName[]; optional?: readonly ServiceName[] };
  /** Services this plugin publishes; providing any other one throws. */
  readonly provides?: readonly ServiceName[];
  readonly config?: Schema<Config>;
  apply(ctx: Context, config: Config): void | Promise<void>;
  /** Apply a new config in place; return false to restart instead. */
  reconfigure?(ctx: Context, config: Config): boolean;
}

export interface BaseContext {
  effect(setup: () => Disposer | Resource): Disposer;
  acquire(kind: string, resource: Disposer | Resource): Disposer;
  own<T extends Resource>(resource: T): T;
  provide<K extends ServiceName>(name: K, value: Services[K]): void;
  plugin<C>(definition: Plugin<C>, config?: C): PluginHandle<C>;
  on / emit / serial / parallel / bail / pipeline; // §5.5
  track(work: Promise<unknown>): void;
  settled(): Promise<void>;
}
export type Context = BaseContext & Services; // ctx.vault, ctx.dialogs, …
// Reading a service the plugin did not inject throws `UndeclaredService`.
```

A plugin module looks like this:

```ts
// src/plugins/backlinks/host.ts
export const backlinksHost: Plugin = {
  name: 'backlinks',
  inject: { required: ['vaults', 'hostCommands', 'views', 'activeEditor'] },
  apply(ctx) {
    const view = new BacklinksView(ctx.vaults, ctx.activeEditor);
    ctx.effect(() => ctx.views.tree('lumiere.markdown.backlinks', view));
    ctx.on('vault/resolved', () => view.refresh());
  },
};
```

Host plugins reach VS Code only through the host services declared in
`src/shared/host` (`hostDocuments`, `hostCommands`, `clipboard`, `dialogs`,
`views`, `activeEditor`, `settings`, `workspace`, `storage`, `extensions`,
`navigation`, `customEditors`, `agentHost`, `git`, `diffViews`). The VS Code
adapters are in `src/host/services`; tests use `fakeHost(overrides)`.

### 5.3 Fiber lifecycle

```text
          plugin()                 required services present
 ┌──────► pending ───────────────────────────────► loading ──► active
 │          ▲                                       │  ▲        │
 │          │ a required service withdrawn          │  │update  │
 │          └───────────────────────────────────────┼──┴────────┤
 │                                     apply throws ▼           │
 │                                                failed        │ dispose()
 └──────────────────────────── (retry on update) ───┘           ▼
                                                             disposed
```

- `pending` lists what it waits for (`fiber.waitingFor`). The plugin status
  UI shows it as "Waiting for Tables".
- `loading` is a transaction: services provided and child plugins started
  during `apply` become visible only when `apply` returns (commit).
- Leaving `active` mirrors activation: the fiber first withdraws the services
  it provided and waits for the dependents that stop because of it, then
  releases its effects and child fibers together, last acquired first.
  Dependents of a withdrawn service go back to `pending`; they become `active`
  again when a provider returns. This is how a service is replaced at runtime.
- `failed` keeps the error. Everything acquired before the throw is released,
  and held child plugins never start. Other fibers are unaffected.
  `update(config)` retries.
- `update(config)` calls `reconfigure` when the plugin defines it and it
  returns `true`; otherwise the fiber restarts.
- Async `apply` is awaited. Required services are read only after `apply`
  starts, so ordering comes from injection, not load order.

### 5.4 Service rules

- A service name has one provider at a time in a context tree. A second
  provider is rejected with `DuplicateService`, except where a service is
  declared `replaceable` (§7). Replaceable services keep a stack, and the
  newest active provider wins.
- Services are interfaces. Consumers import the type from the provider's
  `api.ts`, never its implementation.
- Services expose disposable registrations (`register(...)` returns a
  `Disposer`). Consumers wrap them in `ctx.effect` so they are undone with the
  consumer's fiber.
- A service can be **caller-bound**, Cordis's way of tracing the calling
  context. If the provided value has a `[bindCaller](caller)` method (the
  symbol is exported by the core), a consumer that reads the service through
  its own context gets `value[bindCaller](caller)`, cached per consumer
  context, instead of the shared value. `caller` exposes the consumer's plugin
  name and logger. That is how `editor.extend` and `livePreview.block` know
  which plugin owns a registration, without call sites passing their own
  name.

### 5.5 Events

Events are typed by declaration merging on `Events`. The dispatch mode is part
of the declaration (a `@mode` JSDoc tag, checked by a unit test that scans call
sites).

| Mode | Awaited | Behaviour | Typical use |
| --- | --- | --- | --- |
| `emit` | no | every listener, in rank order (§5.10), errors isolated | notifications |
| `serial` | yes | one at a time, in rank order | `document/willSave` |
| `parallel` | yes | all at once | `vault/indexed` |
| `bail` | no | stop at the first non-`undefined` result | `links/open`, `render/fence` |
| `pipeline` | yes | each listener transforms the value | `paste/transform` |

Errors thrown by listeners are logged against the listener's fiber and do not
stop other listeners (for `bail` and `pipeline`, the listener is skipped).
`pipeline` is awaited, because paste transforms are asynchronous. It is not
Cordis's `waterfall`: see §5.9. `bail` stays synchronous: a listener decides at once whether it
claims the event and may return a promise for the work.
The event catalogue is in §7.3.

### 5.6 Configuration schema

`packages/core/src/schema.ts` is a small schema builder. One definition gives:

- a runtime validator (`schema.parse(value): Config`, with defaults applied);
- a TypeScript type (`Infer<typeof schema>`);
- JSON Schema for `contributes.configuration`, generated into `package.json`
  (§6.4).

```ts
export const config = Schema.object({
  display: Schema.union(['visible', 'hidden', 'source'])
    .default('visible')
    .description('How note properties appear, like Obsidian\'s **Properties in document**.'),
});
```

Supported: boolean, number (min/max), string (pattern), union of literals,
array, object, record. That covers every setting in §15.

### 5.7 Errors, isolation, logging

- Core errors are `CoreError` with codes such as `UndeclaredService`,
  `DuplicateService` and `Disposed`.
- Each fiber has a `Logger` tagged with the plugin name. The host writes to the
  **Lumière** output channel; webview logs are forwarded over RPC at
  `warn` and above, plus all levels when `lumiere.markdown.debug.logging` is
  on. Load and stop timings are logged.
- **Show Plugin Status** lists every fiber per open editor: active, pending
  (and what for), failed (and why), disabled.

### 5.8 Two runtimes, one plugin

A plugin's halves talk through a **plugin channel**: the RPC service (§8.4)
namespaces methods by plugin ID and checks them against the plugin's
`protocol.ts`:

```ts
// src/plugins/suggest/protocol.ts (pure, imported by both halves)
export const protocol = defineProtocol('suggest', {
  requests: {
    candidates: {
      params: Schema.object({ kind: Schema.union(['link', 'heading', 'tag', 'block']), query: Schema.string().max(512), note: Schema.string().max(4096).optional() }),
      result: Schema.array(Suggestion).max(50),
    },
  },
  notifications: {},
});

// host half
ctx.effect(() => ctx.rpc.handle(protocol, 'candidates', (params, panel) => sources.query(params, panel)));
// webview half
const items = await ctx.rpc.call(protocol, 'candidates', { kind: 'link', query });
```

A call to a plugin whose host half is not active rejects with
`PluginDisabled`. A webview half that fails reports back, and the host shows
the plugin as failed for that editor.

### 5.9 Why Cordis, under a core of our own

Until 2026-10 the plugins ran on an in-house kernel, and Cordis was only a
reference (`docs/plans/cordis-decision.md` records why). The two products are
now one extension, and the owner chose one runtime for both: Cordis runs the
fibers, service gating and restarts, and `@workshop/core` keeps the
guarantees this extension relies on and Cordis does not give:

- **Joined, last-first release.** A stop waits for every cleanup, including
  one that started earlier; each release runs even when another fails.
- **Abandoning a start.** Stopping, or a dependency changing, does not wait for
  an asynchronous `apply`; what it acquires afterwards is undone at once.
- **Optional services**, injected while they exist.
- **Event modes.** `pipeline` (awaited, ranked, each listener transforms the
  value), `bail` (synchronous, first non-`undefined` result) and error
  isolation are ours, not Cordis's `waterfall` and exception propagation.
- **Staged publication.** Services appear and children start only once
  `apply` succeeds.

The conformance suite (`packages/core/test/conformance`) is the contract: the
core passes all 23 scenarios; stock Cordis passes 6. Upgrade Cordis only with
it passing.

### 5.10 Composition rules

Plugins compose across time and across the editor: enabling, disabling and
reconfiguring plugins, in any order, gives the same result. Every plugin
follows these rules, and unit tests check them (§21.1).

1. **The outcome depends on the set, not the history.** What the editor does
   depends only on which plugins are enabled and their configs, never on the
   order they loaded or were toggled. Turning a plugin off and on, or changing
   its config, gives the same editor as a fresh start with the same settings:
   the same gutter order, the same key priority, the same decorations.
2. **Order comes from rank, not time.** Wherever order matters (CodeMirror
   extensions, render hooks, event listeners whose order is visible),
   registrations sort by `(slot, owner rank, registration order within the
   owner's apply)`. Owner rank is the plugin's position in the catalog (core
   plugins first, then `features` in `src/plugins/catalog.ts`). Plugins from
   outside extensions rank after built-ins, by plugin ID. The bootstrap gives
   the core a rank function (`createRoot({ rank })`), and both the
   event bus and the editor's extension registry use it, so there is one
   source of order. For events, `prepend: true` acts as a slot: prepended
   listeners run first, each group in rank order. The catalog order is
   deliberate and commented where it matters: for example, `lineNumbers`
   comes before `folding` so line numbers sit to the left of fold markers, as
   in VS Code.
3. **A plugin owns only what it says it does.** Editor-wide settings with one
   winner (`indentUnit`, `EditorState.tabSize`, line wrapping, read-only)
   belong to the `editor` core plugin and come from its settings (§15:
   `editor.useTabs`, `editor.tabSize`). A feature plugin never sets them. A
   plugin that needs to change one asks the owning service through an API
   that composes (as `spellcheck` overrides the `spellcheck` content
   attribute at a higher precedence than the editor's default).
4. **A plugin's state lives in the plugin.** State that exists only because a
   plugin is enabled (folded ranges, a table's selection, a suggestion list)
   is created, saved and restored by that plugin, not by core. Core offers
   extension points (for example, view-state contributions in §9.2) instead
   of knowing about features.
5. **Config changes go through `update`.** The settings controller calls
   `fiber.update(config)`; it never disposes and recreates a fiber itself.
   Plugins whose config can change cheaply implement `reconfigure` (usually by
   reconfiguring a compartment of their own) so the change keeps user state,
   such as folds.

## 6. Plugin packaging

### 6.1 Layout

```text
src/plugins/<id>/
├── manifest.ts    pure: ID, title, description, Obsidian reference, defaults,
│                  config schema, VS Code contributions, surfaces
├── protocol.ts    pure: RPC between the halves (if both exist)
├── api.ts         pure types: the services this plugin provides
├── host.ts        host half (optional)
├── webview.ts     webview half (optional)
├── *.ts / *.css   internal modules, private to the plugin
├── *.test.ts      unit tests
└── README.md      purpose, Obsidian behaviour, services, events, limits
```

`src/plugins/host.ts` and `src/plugins/webview.ts` list the halves for the two
bundles. A unit test checks that every manifest's surfaces match those lists.
ESLint `no-restricted-imports` forbids one plugin importing another plugin's
files except `manifest.ts`, `protocol.ts` and `api.ts`, and forbids plugins
importing `src/host` or `src/webview` except `src/webview/ui` (webview halves
only) and `src/host/api/types.ts` (types only).

### 6.2 Manifest

```ts
export default defineManifest({
  id: 'tables',
  title: 'Tables',
  description: 'Edit Markdown tables as grids: cells, rows and columns, menus and drag reordering.',
  obsidian: 'Live Preview table editor',
  kind: 'feature',            // 'core' plugins cannot be turned off
  defaultEnabled: true,
  surfaces: ['webview'],
  capabilities: ['rendering', 'editing', 'commands'],
  config,                     // Schema (§5.6), or omitted
  contributes: {              // merged into package.json by the generator (§6.4)
    commands: [{ id: 'insertTable', title: 'Insert Table', editorCommand: 'editor:insert-table' }],
  },
});
```

`capabilities` says what the plugin does in host-neutral terms (registers
the editor, renders, edits, contributes commands or views, reads the vault
index, writes other files, uses the network, hands selections to agents);
the `Capability` type in `src/shared/manifest.ts` lists them. Precedence is
`src/plugins/plugin-order.ts` and dependencies are derived from each
plugin's `inject` (`src/plugins/plugin-graph.ts`); the manifest declares
neither. A unit test keeps `commands`, `keybindings` and `views` in step
with `contributes`, allows `editorProvider` only on `editor`, and requires
`network` plugins to check workspace trust.

### 6.3 Enabling, disabling and presets

- Each `feature` plugin has `lumiere.markdown.plugins.<id>.enabled`
  (resource scope, default from the manifest). `core` plugins have no switch.
- A **preset** is the list of plugins the root context loads:
  - `obsidian` (default): everything in §13 that is enabled;
  - `minimal`: `document`, `editor`, `dialect` and `commands` only. This
    gives a plain CodeMirror Markdown source editor that stays synchronized,
    saves and undoes. It is the safe mode for diagnosing a plugin, like
    Obsidian's restricted mode.
  - Chosen by `lumiere.markdown.preset`.
- Turning a plugin off disposes its fibers in every runtime at once. Its
  CodeMirror extensions leave their compartments, its decorations disappear
  and its widgets re-render as source. No reload is needed.
- A plugin can inject another plugin's service. If the provider is off, the
  consumer is `pending` and the status shows it blocked.
- External overrides (plugins from other extensions) use
  `lumiere.markdown.plugins.external` (`{ [id]: boolean }`), as in PDF
  Workbench.

### 6.4 Generated contributions

VS Code needs static `contributes`. `scripts/generate-contributions.ts` builds
`configuration`, `commands`, `menus`, `keybindings`, `views` and
`viewsWelcome` from the manifests:

- `when` clauses are ANDed with `lumiere.markdown.plugin.<id>` (a context key
  the host sets while that plugin is active for the active editor) and, for
  editor commands, `activeCustomEditorId == 'lumiere.markdown.editor'`.
  Their keybindings also need `lumiere.markdown.editorFocus` (the active
  note's webview has focus): `activeCustomEditorId` stays set while focus is
  elsewhere, and an extension binding outranks a built-in one for the same
  key.
- Editor commands (`editorCommand`) route to the active editor's webview
  (§14), so they need no host code.
- A unit test fails when `package.json` differs from the generator's output.

### 6.5 Plugin management UI

As in PDF Workbench: **Lumière: Manage Plugins** opens Settings
filtered to `lumiere.markdown.plugins`, and **Show Plugin Status** shows a
quick pick of states for the active editor. `setPluginEnabled` and
`resetPluginOverride` take an explicit scope (user, workspace, folder).

## 7. Services

### 7.1 Runtime services (provided by the bootstrap)

| Service | Runtime | Purpose |
| --- | --- | --- |
| `transport` | both | Raw message channel for one panel (host: per panel; webview: one) |
| `rpc` | both | Validated requests, notifications, cancellation and timeouts over `transport` (§8.4) |
| `settings` | host | Resource-scoped reads of plugin configs, change events |
| `workbench` | host | Thin wrappers over the VS Code API returning disposers: commands, tree views, status bar, context keys, quick picks, output, file system. The only host module (besides `extension.ts`) that imports `vscode` broadly, which keeps plugins testable with a fake |
| `logger` | both | §5.7 |

### 7.2 Services provided by plugins

| Service | Runtime | Provider | Summary |
| --- | --- | --- | --- |
| `documents` | host | `document` | Sessions per `TextDocument`: authority, apply edits, flush, save, undo groups |
| `document` | webview | `document` | collab state, `push`, `whenFlushed`, sync status |
| `editors` | host | `editor` | Panels: open, active panel (by tab group), per-panel RPC, view state, reveal |
| `editor` | webview | `editor` | The `EditorView`, compartments, precedence slots, `extend()`, focus |
| `markdown` | both | `dialect` | Lezer parser, parse cache, metadata extraction, HTML renderer, sanitizer |
| `vault` | host | `vault` | Files, metadata, link resolution, backlinks, tags, change events (§12) |
| `resources` | both | `resources` | Load contained files for the webview (images, embeds, notes) |
| `commands` | both | `commands` | Host: VS Code commands. Webview: editor commands by Obsidian ID |
| `livePreview` | webview | `livePreview` | Block and inline renderer registries, reveal rule, mode (§11) |
| `render` | webview | `render` | Render Markdown into DOM with post-processors (§10.4) |
| `suggest` | webview | `suggest` | EditorSuggest framework; plugins register sources |
| `menu` | webview | `editor` | In-editor menus (tables, properties, chips) |
| `markers` | both | `markers` | Source-bound badges from plugins and the API (§18.3) |
| `fold` | webview | `folding` | Heading and indent folds, persisted per view through a view-state contribution (§9.2) |

`vault`, `resources` and `markers` are `replaceable`: an outside plugin (for
example LLM Wiki) may provide a richer implementation that implements the same
interface.

### 7.3 Event catalogue

| Event | Runtime | Mode | Signature | Notes |
| --- | --- | --- | --- | --- |
| `editor/opened` | host | emit | `(panel)` | |
| `editor/closed` | host | emit | `(panel)` | |
| `editor/activeChanged` | host | emit | `(panel \| undefined)` | |
| `editor/selectionChanged` | host | emit | `(panel, hasSelection)` | |
| `document/changed` | host | emit | `(session, change)` | after the `TextDocument` changes |
| `document/willSave` | host | serial | `(session)` | flush webviews; plugins finish pending edits |
| `vault/changed` | host | emit | `(root, change: VaultChange)` | create/modify/delete/rename, after indexing; `root` names the vault |
| `vault/resolved` | host | emit | `(root)` | link maps settled (Obsidian `resolved`) |
| `links/open` | host | bail | `(request: LinkRequest) => Promise<true> \| undefined` | first handler wins; then the default (§16) |
| `files/willRename` | host | serial | `(rename, edit: WorkspaceEdit)` | `linkUpdates` adds link rewrites |
| `render/fence` | webview | bail | `(fence, pass) => RenderedFence \| undefined` | `math`, `diagrams`, `search`, `codeBlocks` claim languages |
| `render/postProcess` | webview | serial | `(pass) => void` | Obsidian `registerMarkdownPostProcessor` |
| `paste/transform` | webview | pipeline | `(data: PasteData) => PasteData` | HTML→Markdown, later attachment saving |
| `editor/menu` | webview | serial | `(menu, context)` | Obsidian `editor-menu` |
| `link/click` | webview | bail | `(link, event) => true \| undefined` | in-note fragments handled locally; the rest go to the host |

## 8. Document model and synchronization (`document` plugin)

Port from `host/document-session.ts`, `shared/authority.ts`,
`host/undo-groups.ts`, `editor/sync.ts`, `editor/input-groups.ts`. Behaviour is
tested and stays the same. The changes are structural.

### 8.1 Authority

- One `DocumentSession` per open `TextDocument`. It holds `Authority`, a
  revision log for transport, not a second undo stack, kept only while a view
  is open.
- A webview pushes `@codemirror/collab` updates against a version. The session
  rebases them over newer history, applies them as one `WorkspaceEdit` that
  preserves the file's EOL, and confirms. Others receive `updates`.
- External changes (another editor, Git, the file system) arrive through
  `onDidChangeTextDocument` and are recorded as host updates.
- Positions on the wire are LF-normalized UTF-16 offsets. `SourceCoordinates`
  maps them to original offsets for CRLF files.

### 8.2 Undo, redo and save

- Undo and redo are VS Code's. `UndoGroups` is metadata over native steps:
  it lets one logical input group (a Vim insert, a structural table edit)
  undo in one step, and clears itself whenever native history diverges.
- Save waits for `document/willSave` (which flushes every view through
  `onWillSaveTextDocument.waitUntil`). The `saveDocument` workaround for
  overlapping workbench saves is kept, with its regression test.
- Hot exit and recovery are VS Code's (custom text editor over a text
  document).

### 8.3 Session clean-up

The session's dispatcher switch (about 200 lines) is replaced. The session
handles only document sync; everything else moves to the plugin that owns it:

| Was in `DocumentSession.receive` | Now |
| --- | --- |
| `link` | `links` plugin (`links/open`) |
| `search`, `cancelSearch` | `search` plugin channel |
| `suggest` | `suggest` plugin channel; sources from `links` and `tags` |
| `tag` | `tags` plugin |
| `resource` | `resources` plugin |
| `task` (embedded notes) | `tasks` plugin |
| `copy`, `readClipboard` | `editor` plugin channel (`clipboard.write`, `clipboard.read`) |
| `action` | `commands` (`save`, `undo`, `redo`, `close`, `saveClose`, `openAsText`) |
| `renameTitle` | `inlineTitle` plugin |
| `setPropertyType` | `properties` plugin |
| `openQuery`, `annotations` | removed; generalized as `markers` (§18.3) |

The hard-coded `viewType = "llm-wiki.markdownEditor"` inside the session goes
away; only the `editor` plugin knows the view type.

### 8.4 RPC

`src/shared/rpc/` defines the envelope and the plugin channel:

```ts
type Envelope =
  | { kind: 'request'; id: number; channel: string; method: string; params: unknown }
  | { kind: 'response'; id: number; result: unknown }
  | { kind: 'error'; id: number; code: string; message: string }
  | { kind: 'notify'; channel: string; method: string; params: unknown }
  | { kind: 'cancel'; id: number }
  | { kind: 'batch'; version: number; messages: NotifyEnvelope[] };
```

- State notifications where only the latest value matters (the selection
  flag, selection and title actions, a note's unresolved links) are sent with
  `notify(..., { coalesce: true })`: they wait until the end of the task,
  replace an unsent one of the same method, and leave together as one
  `batch` whose `version` grows per endpoint. A receiver drops a batch whose
  version is not above the last one it applied. Any other envelope sends
  the pending batch first, so a request (Copy Link for Agent, a flush) never
  overtakes the state it depends on. Document updates are not coalesced:
  they carry their own document versions and every one must arrive.
- Every method has a params schema and a result schema (§5.6). Invalid input is
  dropped and logged; an invalid result rejects the caller.
- Requests have a default 10-second timeout and can be cancelled.
- Channels: `document` (sync), `editor` (focus, reveal, view state, clipboard),
  `plugins` (state, failures), plus one per plugin. The handshake (`ready` →
  `init`) is part of `editor`.
- This replaces the request-ID maps in the source: selections, view states,
  flushes, clipboard reads, resources, suggestions and searches.

## 9. Editor and panels (`editor` plugin)

### 9.1 Host half

Split `vscode-extension/src/markdown/provider.ts` (752 lines) into:

| Module | Job |
| --- | --- |
| `provider.ts` | `CustomTextEditorProvider`: create a `Panel`, attach it to the session |
| `panels.ts` | Registry of panels by panel ID (never by path), active panel via `tabGroups.activeTabGroup.activeTab` (a webview's `active` flag can be stale), events |
| `panel.ts` | One editor: its transport, RPC, plugin state for its document, selection flag, disposal |
| `view-transfer.ts` | Capture and restore view state across rename and reopen (current `renamedViews` logic) |
| `webview-html.ts` | HTML, CSP and nonce (§19) |

The editor is described by an `EditorProvider` (`src/shared/editor-provider.ts`:
view type, display name, file patterns, document kind, panel options);
`workshop.registerEditor(provider, open)` and `src/host/editor-panels.ts`
register whatever provider they are given and know nothing about Markdown.
`MARKDOWN_EDITOR` is the single source of the view type and patterns for
associations, reclaiming, navigation, renames and generated contributions.

Registration keeps `retainContextWhenHidden: true` and
`supportsMultipleEditorsPerDocument: true`. Two panels of one note share a
session and history but keep their own selections, folds and scroll.

### 9.2 Webview half

`editor/app.ts` (565 lines) currently constructs a 40-item extension array in
one function, with ordering rules expressed as comments ("Before the editor
keymap…"). The new `editor` plugin:

- creates the `EditorView` after `init`, with the base extensions only:
  `collab` (from `document`), the language (from `dialect`), selection drawing,
  line wrapping, content attributes, base keymap, and the editor-wide settings
  it owns (`indentUnit` and `EditorState.tabSize` from `editor.useTabs` and
  `editor.tabSize`, §5.10 rule 3);
- keeps plugin extensions in an ordered registry, not in compartments
  appended over time. `editor` is caller-bound (§5.4), so
  `ctx.editor.extend(extension, { slot })` records the calling plugin as
  owner. The registry sorts by slot, owner rank and registration order within
  the owner (§5.10 rule 2), and reconfigures one plugin-extensions compartment
  with the sorted list. Disposing a registration removes it and reconfigures
  again. CodeMirror keeps the state of fields and view plugins that remain in
  the configuration, so other plugins are unaffected. A plugin may also
  register on another plugin's behalf with an explicit owner, as
  `livePreview.block` does for its callers. The ordering logic is a pure
  module (`editor/extensions.ts`), unit-tested on `EditorState`;
- offers **view-state contributions**:
  `ctx.editor.viewState.contribute(key, { schema, capture(view), restore(view, value) })`.
  The editor saves each contribution under its key with the panel's view
  state, restores it when the contributor registers (including when a plugin
  is enabled after the panel opened), and carries keys with no live
  contributor over unchanged. Folded ranges are the `folding` plugin's
  contribution, not core state;
- has named precedence slots instead of comments:

| Slot | Precedence | Used by |
| --- | --- | --- |
| `override` | `Prec.highest` | host keys (save, undo), Vim, table navigation before Vim |
| `suggest` | `Prec.high` | suggestion lists (Enter/Escape on an open list) |
| `keymap` | default | formatting commands, folding keys, smart lists |
| `base` | `Prec.low` | default keymap, search keymap |

- provides the `menu` service (from `editor/menu.ts`) and the edge-scroll
  helper for drags;
- owns focus and activation messages, `revealSelection` and theme following
  (`editor/theme.ts`).

`app.ts` becomes the webview bootstrap only: create the root context, connect
the transport, and load and stop plugins as the host directs.

## 10. Markdown dialect and rendering (`dialect` and `render` plugins)

### 10.1 One parser

The source configures `parser.configure([GFM, obsidianSyntax])` in four
places (`parse.ts`, `fragments.ts`, `tags.ts`, `editor/markdown.ts`). Replace
these with `src/markdown/dialect/`:

```text
dialect/
├── index.ts        markdownParser, markdownLanguageSupport(), parseCached(text)
├── frontmatter.ts  Frontmatter block (first line only)
├── math.ts         MathBlock, InlineMath, MathMark
├── wiki.ts         WikiLink, WikiEmbed
├── tags.ts         Tag (grammar from shared/tag.ts)
├── footnotes.ts    FootnoteRef, InlineFootnote
├── highlight.ts    Highlight, HighlightMark
└── comments.ts     ObsidianComment
```

The dialect is fixed (Obsidian Flavored Markdown). The host vault worker, the
webview and tests all use the same configuration, so a note always has the same
structure everywhere. Node names stay as in the source.

### 10.2 Metadata

`src/markdown/metadata/` extracts Obsidian's `CachedMetadata` shape from one
parse: `links`, `embeds`, `tags`, `headings`, `sections`, `blocks` (`^id`),
`footnotes`, `listItems` (with task status), `frontmatter`,
`frontmatterLinks`, `aliases`. Positions are `{ line, col, offset }` for start
and end. This module is the single source for headings (`noteHeadings`),
fragments (`noteFragment`), tags (`noteTags`) and footnotes; those functions
become views over metadata.

### 10.3 HTML renderer

`markdown/render.ts` (588 lines) configures a module-level markdown-it
singleton with every feature built in. Replace it with
`src/markdown/html/createRenderer()`, a factory composed from one module per
syntax: `wiki.ts`, `tags.ts`, `comments.ts`, `math.ts`, `callouts.ts`,
`tasks.ts`, `block-ids.ts`, `headings.ts`, `images.ts`, `fences.ts`,
`html.ts`.

- The renderer emits **placeholders** for anything a plugin enhances:
  `[data-math]`, `[data-fence="<lang>"]`, `[data-resource]` (embeds and
  images), `[data-task]`, `button.md-tag`, `a.internal-link`. With the owning
  plugin off, a placeholder stays readable text or code, as in source.
- `renderProperties` (the HTML of the Properties sheet) moves to the
  `properties` plugin. It is UI, not Markdown.
- Footnote placeholders work as in the source's `render/content.ts`.

### 10.4 Render pipeline (`render` plugin)

`ctx.render.into(container, source, context)` does what
`editor/render/content.ts` does now, but through the event hooks:

1. Render the HTML with the dialect renderer.
2. Sanitize with DOMPurify (`render/sanitize.ts`, §19).
3. For each `[data-fence]`, `bail('render/fence', fence, pass)`. With no
   claim, the plain code block remains.
4. `serial('render/postProcess', pass)`. Plugins bind tasks, embeds, tags,
   disclosure memory and properties.
5. Dispose the pass when the widget is destroyed (`RenderPass.onDispose`, as
   now).

`ContentContext` (a bag of optional callbacks: `open`, `tag`, `search`,
`resource`, `task`, `propertyEditor`, `footnotes`, …) is replaced by services.
A post-processor injects what it needs; a pass carries only `source`,
`container`, `measure`, `ancestry` (for circular embeds), `renderKey` and
`sourceLine`.

## 11. Live Preview engine (`livePreview` plugin)

Port from `editor/hybrid-inline.ts`, `editor/hybrid-blocks.ts`,
`editor/document-tree.ts`, `editor/rendered-position.ts`. The decisions below
follow the Obsidian study §5.

### 11.1 Structure

| Part | Kind | Rebuilds on |
| --- | --- | --- |
| `documentTree` | `StateField<Tree>` | document change (incremental, fragment reuse; first line never reused) |
| `blockIndex` | `StateField<RenderBlock[]>` | document change |
| `blockDecorations` | `StateField<DecorationSet>` | index, selection, folds, mode, render revision, properties display |
| `inlineDecorations` | `ViewPlugin` | viewport or selection; mapped, not rebuilt, during composition or a mouse drag |

Block replacements stay in a state field because only fields can change
vertical layout across lines.

### 11.2 Renderer registry

Plugins register what they render instead of the engine knowing every node:

```ts
interface BlockRenderer {
  kind: string;                                    // 'Table', 'callout', 'math', …
  match(node: SyntaxNodeRef, state: EditorState): boolean;
  /** 'reveal' shows source while selected; 'widget' stays rendered (tables, properties). */
  editing: 'reveal' | 'widget';
  widget(block: RenderBlock): WidgetType;
  estimatedHeight?: number;
}
interface InlineRenderer {
  nodes: readonly string[];                        // e.g. ['Tag'] or ['WikiLink']
  decorate(node: SyntaxNodeRef, cx: InlineContext): void;   // cx.mark/hide/replace/line, cx.revealed(from, to)
}
ctx.effect(() => ctx.livePreview.block(tableRenderer));
ctx.effect(() => ctx.livePreview.inline(tagRenderer));
```

When several block renderers match a node, the first in rank order (§5.10)
wins, as with `bail` events. Specific renderers rank before general ones in
the catalog, for example `diagrams` before `codeBlocks`, which both match a
Mermaid fence.

Registries are facets fed from fiber compartments. Turning a plugin off
removes its renderers, and the engine dispatches a render-revision bump so its
widgets fall back to source. Basic syntax (emphasis, strong, strikethrough,
inline code, headings, quotes, list bullets, escapes, Markdown links) is
rendered by the engine itself.

### 11.3 The reveal rule

One function, `revealed(state, from, to, kind)`, used by every renderer:

- A range is revealed when any selection range touches it. Blocks include the
  end of their last line, so the caret after the last character keeps source.
  This is the source's `editing()` rule, which prevents lost input at a block's
  final character.
- Properties are never revealed by the caret in `visible` mode. In `hidden`
  mode they are atomic and are revealed only while the caret is inside them
  (explicit navigation such as Vim `gg`).
- While composing (IME) or dragging with the mouse, decorations are mapped,
  not rebuilt (Obsidian skips rebuilds in both cases). Add the drag case; the
  source handles only composition.
- Later: search matches reveal source, as in Obsidian.

### 11.4 Widgets

- `eq` compares kind, content key, footnote references and render revision, so
  unchanged blocks keep their DOM when positions shift.
- `updateDOM` is allowed for in-place reconciliation (properties keep a
  focused, composing input connected).
- `toDOM` errors are caught. The block shows its source with an error marker,
  and the plugin's logger records it.
- `estimatedHeight` comes from the renderer.

### 11.5 Modes and motion

- **Live Preview** and **Source mode**, per view. The default comes from
  `lumiere.markdown.editor.defaultMode`. **Toggle Live Preview/Source Mode**
  switches the active view. Source mode removes all Live Preview decorations
  and shows properties as YAML; the inline title stays.
- Vertical motion: ArrowUp and ArrowDown step over a rendered block as one
  line (Obsidian behaviour). Escape inside revealed block source moves past
  the block (`leaveBlockSource`, kept).
- Clicking rendered inline text puts the caret at the matching source offset
  before syntax is revealed (`rendered-position.ts`, kept).

## 12. Vault index (`vault` plugin)

The source resolves links three different ways and scans the workspace on
demand four times:

| Source code | Problem |
| --- | --- |
| `host/resources.ts` `resolve` | falls back to `findFiles('**/*', …, 25000)` on every unresolved link click, then suffix-matches |
| `vscode-extension/src/wikiLinks.ts` | invents `notes/Concepts/...` paths (LLM Wiki-specific) |
| `vscode-extension/src/localLinkTargetResolver.ts` | another bundle-relative scheme |
| `host/suggestions.ts`, `host/tag-search.ts`, `host/query-session.ts` | each lists and reads files independently |

The vault index replaces all of them, following Obsidian's MetadataCache.

### 12.1 Vault root

A vault is the nearest ancestor folder of a note, within its workspace
folder, that contains a marker from `lumiere.markdown.vault.rootMarkers`
(default `[".obsidian"]`; LLM Wiki users add `"SCHEMA.md"`). With no marker,
the workspace folder is the vault. A note outside any workspace folder is a
one-note vault: no index, and links resolve relative to its folder.
Multi-root workspaces have one index per vault.

### 12.2 Data

```ts
interface VaultIndex {
  readonly root: Uri;
  files(): readonly VaultFile[];                       // path, basename, extension, mtime, size
  metadata(path: string): NoteMetadata | undefined;    // §10.2
  resolveLink(linktext: string, sourcePath: string): VaultFile | undefined;
  resolveLinkCandidates(linktext: string, sourcePath: string): readonly VaultFile[];
  linkText(target: VaultFile, sourcePath: string): string;  // honours the new-link format
  resolvedLinks(sourcePath: string): ReadonlyMap<string, number>;
  unresolvedLinks(sourcePath: string): ReadonlyMap<string, number>;
  backlinks(targetPath: string): readonly Backlink[];       // computed, not stored
  tags(): ReadonlyMap<string, number>;                      // hierarchical counts
  readonly onDidChange: Event<VaultChange>;
  readonly onDidResolve: Event<void>;
}
```

- Files: a flat path map plus `uniqueFileLookup` (lower-case basename →
  files), updated on create, delete and rename.
- Metadata: `{ path → { mtime, size, hash } }` and `{ hash → NoteMetadata }`.
  An unchanged hash is not parsed again.
- Parsing runs in `dist/workers/vault.cjs` (`worker_threads`), one file in
  flight, receiving the text as a transferable buffer. The host is never
  blocked for more than about 16 ms by indexing.
- Persistence: JSON in `context.storageUri` (per workspace), written
  atomically at most every 2 seconds. At start, files whose `mtime` and `size`
  match are not re-read. Orphaned metadata is collected periodically.
- Link maps: `resolvedLinks` and `unresolvedLinks` per source. When a file is
  created, deleted or renamed, only sources whose link sets mention its name
  are re-resolved (Obsidian's `updateRelatedLinks`). `vault/resolved` fires
  when the queue drains.
- Open documents count with their unsaved text: `document/changed` re-indexes
  a note from its `TextDocument`, debounced to 300 ms.
- Ignored: hidden folders (`.git`, `.obsidian`, `.trash`) and
  `node_modules`. `lumiere.markdown.vault.excludedFiles` is Obsidian's
  **Excluded files** and behaves as it does there: excluded files are still
  indexed and links to them resolve, but they are flagged `excluded`, and the
  quick switcher, suggestions, search and unlinked mentions leave them out. A
  filter without wildcards is a path prefix, as in Obsidian; globs are also
  accepted. Limit 50,000 files per vault; beyond that the index reports
  itself partial.

### 12.3 Link resolution

`resolveLink(linktext, source)` follows Obsidian's `getLinkpathDest`:

1. Remove the subpath (`#heading`, `#^block`) and alias. An empty path means
   the source note.
2. Exact vault path, with `.md` appended when the link has no extension.
3. A unique basename match in `uniqueFileLookup`.
4. `./` and `../` relative to the source's folder.
5. A leading `/` from the vault root.
6. Otherwise, files whose path ends with the link path, sorted by folder
   distance from the source (same folder first), then by path. The first
   wins; `resolveLinkCandidates` returns all of them.

A folder link resolves to `lumiere.markdown.links.folderNote` inside it when
that setting is set (default empty; LLM Wiki uses `_index.md`), and otherwise
reveals the folder in the Explorer.

`linkText(target, source)` implements the new-link format: `shortest`
(basename when unique, else path), `relative` or `absolute`, as in Obsidian's
`fileToLinktext`. Suggestions and link updates use it.

### 12.4 Resources and containment (`resources` plugin)

`NoteResources` keeps its containment checks: a resource must lie inside the
vault root, `realpath` must not escape it on `file:` URIs, and on virtual file
systems symbolic links are refused. It no longer searches; it asks
`vault.resolveLink`. Webview URLs carry `?v=<mtime>` to defeat caching, as now.

## 13. Plugin catalogue

Core plugins (always on in the `obsidian` preset; the first four make up the
`minimal` preset):

| ID | Surfaces | Provides | Notes |
| --- | --- | --- | --- |
| `document` | host, webview | `documents`, `document` | §8 |
| `editor` | host, webview | `editors`, `editor`, `menu` | §9 |
| `dialect` | host, webview | `markdown` | §10.1–10.3 |
| `commands` | host, webview | `commands` | §14 |
| `vault` | host | `vault` | §12 |
| `resources` | host, webview | `resources` | §12.4 |
| `render` | webview | `render` | §10.4 |
| `livePreview` | host, webview | `livePreview` | §11 (host half: mode toggle command and context key) |
| `markers` | host, webview | `markers` | §18.3 |

Feature plugins. "Obsidian" names the core plugin or setting that the feature
corresponds to. "Source" names the module on the source branch.

| ID | Obsidian | Default | Injects | Source |
| --- | --- | --- | --- | --- |
| `properties` | Properties view; *Properties in document* | on | render, livePreview, markdown | `editor/properties/*`, `markdown/properties.ts`, `property-order.ts`, `host/property-types.ts` |
| `inlineTitle` | *Show inline title*; rename from title | off (owner decision, 2026-10-09) | editor, documents | `editor/file-title.ts`, `markdown/rename-note.ts` |
| `links` | internal links, link following, unresolved styling | on | vault, livePreview, editors | `hybrid-inline.ts` (links), `app.ts` `listenForLinks`, `session.openLink` |
| `embeds` | `![[ ]]` transclusion, attachments, media | on | resources, render | `render/embeds.ts`, `media/*` |
| `tables` | Live Preview table editor | on | livePreview, render, menu | `table/*` |
| `callouts` | callouts | on | livePreview, render | `render.ts` callouts, `render/disclosure.ts` |
| `math` | MathJax | on | render, livePreview | `editor/math.ts`, `render/typeset.ts` |
| `diagrams` | Mermaid | on | render | `render/typeset.ts` |
| `codeBlocks` | highlighting, copy button, editable fences | on | render, livePreview | `code-source.ts`, `code-highlight.ts`, `code-selection.ts` |
| `footnotes` | footnotes, inline footnotes | on | livePreview, render | `footnote-widget.ts`, footnote parts of `hybrid-*` |
| `tasks` | task checkboxes, also in embeds | on | render, livePreview, documents | `render/tasks.ts`, `TaskBox`, session `task` |
| `tags` | tag rendering, tag search, **Tags** view | on | vault, livePreview, workbench | `TagWidget`, `host/tag-search.ts`, `shared/tag-tree.ts` |
| `suggest` | EditorSuggest: `[[`, `[[#`, `[[^`, `#` | on | vault, editor | `editor/suggest.ts`, `host/suggestions.ts` |
| `pagePreview` | Page preview (hover) | on | render, resources | `editor/link-preview.ts` |
| `outline` | Outline view | on | editors, markdown, workbench | `markdownSymbols.ts` (rewritten); replaces the in-editor outline panel |
| `backlinks` | Backlinks, unlinked mentions, count | off | vault, editors, workbench | `backlinksProvider.ts` (rewritten) |
| `outgoingLinks` | Outgoing links | off | vault, editors, workbench | new |
| `search` | embedded `query` blocks | on | vault, render | `search/*`, `host/query-session.ts` |
| `folding` | *Fold heading*, *Fold indent* | on | editor | `outline.ts` (folding parts), presentation folds |
| `lineNumbers` | *Show line numbers* | on | editor | `lineNumbers()` |
| `indentGuides` | *Show indentation guides* | on | editor | new |
| `vim` | *Vim key bindings* | off | editor, commands | `editor/vim.ts` |
| `autoPair` | *Auto pair brackets*, *Auto pair Markdown syntax* | on | editor | `editor/markdown.ts` `autoPairing` |
| `smartLists` | *Smart lists* | on | editor | `markdownKeymap` |
| `pasteHtml` | *Auto convert HTML* | on | editor | `markdown/paste.ts`, `editor/clipboard.ts` |
| `spellcheck` | *Spellcheck* | on | editor | content attributes |
| `formatting` | `editor:toggle-*`, `editor:set-heading-*` and similar | on | editor, commands | `editor/markdown.ts` `wrapSelection`, main branch `obsidianLikeCommands` |
| `agentBridge` | none (from LLM Wiki) | on | editors, documents, workbench | `selectionHandoff.ts`, `agentClipboard.ts` (Markdown part) |
| `linkUpdates` | *Automatically update internal links* | on (prompt) | vault, workbench | new |
| `quickSwitcher` | Quick switcher | on | vault, workbench | new |
| `wordCount` | Word count (status bar) | on | editors, workbench | new |

Short specifications, beyond the source's tested behaviour:

- **links**: plain click opens a rendered link; Cmd/Ctrl-click opens it, or
  revealed source, in a tab of its own (one VS Code keeps, not a preview; as
  Obsidian's new tab); a click that ends a text selection only selects. Unresolved
  wikilinks get `is-unresolved` styling while not revealed, from
  `vault.unresolvedLinks` (the host pushes the note's set when it changes after
  each re-resolution, through `VaultIndex.onDidResolve`: panel kernels do not
  see the window's `vault/resolved` event). Opening goes through `links/open` (§16). Cmd/Ctrl+Alt+click
  opens to the side.
- **suggest**: sources are `[[` files and frontmatter `aliases` and unresolved
  link texts; `[[Note#` headings; `[[Note#^` and `[[^^` blocks; `#` tags.
  Scoring uses Obsidian's fuzzy formula (study §8; `src/shared/fuzzy.ts`
  replaces `shared/match.ts`), with each CJK character its own token; measured
  against Obsidian's lists, the word-start term applies only when whole words
  match, a note matched by its name comes before one matched only through its
  folder, a note matches on its path without `.md`, and an alias, heading or
  tag only on its own text. Accepting with Enter closes `]]` (reusing an
  auto-inserted one) and inserts `vault.linkText`; Tab takes the text only.
- **outline**: a native Explorer tree view (like PDF Outline) of the active
  editor's headings, with click to reveal and current-heading tracking, plus
  a heading Quick Pick on Ctrl+Shift+O in Workshop. VS Code's built-in Markdown
  provider supplies Outline and breadcrumbs in the plain text editor. This
  removes the in-webview outline panel and its
  **Toggle Outline** title action.
- **backlinks** and **outgoingLinks**: native views (an Explorer section, or a
  view container per §25). Group by file, one trimmed context line per
  reference, collapsed **Unlinked mentions** section (basename occurrences
  outside links, computed on demand), and a status bar count for the active
  note (inverting `resolvedLinks`). Both are off by default (owner decision);
  turning a switch on shows its view.
- **tags**: the **Tags** view is hierarchical (`a/b/c` counts toward `a/b` and
  `a`), merges case and keeps the most frequent casing, and searches on click.
  Tag search uses the index, not a full read of the workspace.
- **linkUpdates**: on `files/willRename` (from
  `workspace.onWillRenameFiles`), rewrite incoming links and embeds through
  `vault.backlinks`, keeping aliases, subpaths and the link style. The default,
  `prompt`, shows a **Update links in N files?** dialog; `always` and `never`
  skip it. Heading renames are a later enhancement.
- **quickSwitcher**: **Lumière: Quick Switcher** opens a quick pick
  over notes, aliases and unresolved links, with Obsidian's scoring. Enter
  opens; an unresolved or new name creates the note in the configured
  new-note folder.
- **wordCount**: words and characters for the note or selection in the status
  bar, counting CJK characters individually.
- **properties**: everything in the source, including types per vault (now
  keyed by vault root from §12.1, not the `AGENTS.md`+`SCHEMA.md` heuristic),
  chips, sorting, drag ordering, structured clipboard (`obsidian/properties`),
  draft reconciliation, and `Cmd/Ctrl+;` **Add file property**.
- **search**: query parsing and evaluation stay (`search/query.ts`,
  `evaluate.ts`, worker). File discovery and reading use the vault index and
  its content cache instead of `findFiles` per run. Operators backed by the
  index (`tag:`, `path:`, `file:`, `[property:value]`) skip reading files.

## 14. Commands, keys and menus

Editor commands are registered in the webview under Obsidian IDs
(`ctx.commands.register('editor:toggle-bold', run)`). Their manifests declare
the VS Code command `lumiere.markdown.<name>`, which the generator routes to
the active editor. They work in the command palette, keybindings and menus.

| VS Code command | Obsidian ID | Plugin | Default key |
| --- | --- | --- | --- |
| `toggleBold` | `editor:toggle-bold` | formatting | Mod+B |
| `toggleItalics` | `editor:toggle-italics` | formatting | Mod+I |
| `toggleStrikethrough` | `editor:toggle-strikethrough` | formatting | verify |
| `toggleHighlight` | `editor:toggle-highlight` | formatting | verify |
| `toggleCode` | `editor:toggle-code` | formatting | verify |
| `toggleComment` | `editor:toggle-comments` | formatting | Mod+/ (verify) |
| `toggleInlineMath` | `editor:toggle-inline-math` | math | — |
| `insertMathBlock` | `editor:insert-mathblock` | math | — |
| `insertLink` | `editor:insert-link` | formatting | Mod+K |
| `insertWikilink` | `editor:insert-wikilink` | links | — |
| `insertEmbed` | `editor:insert-embed` | embeds | — |
| `insertTable` | `editor:insert-table` | tables | — |
| `insertHorizontalRule` | `editor:insert-horizontal-rule` | formatting | — |
| `insertFootnote` | `editor:insert-footnote` | footnotes | — |
| `insertCallout` | `editor:insert-callout` | callouts | — |
| `setHeading0`…`setHeading6` | `editor:set-heading-0`…`6` | formatting | — |
| `toggleChecklist` | `editor:toggle-checklist-status` | tasks | verify |
| `cycleListChecklist` | `editor:cycle-list-checklist` | tasks | verify |
| `toggleBulletList`, `toggleNumberedList`, `toggleBlockquote` | `editor:toggle-*` | formatting | — |
| `swapLineUp`, `swapLineDown` | `editor:swap-line-up/down` | formatting | — |
| `followLink` | `editor:follow-link` | links | — |
| `openLinkToSide` | `editor:open-link-in-new-split` | links | — |
| `foldAll`, `unfoldAll`, `toggleFold` | `editor:fold-all`, `editor:unfold-all`, `editor:toggle-fold` | folding | — |
| `addProperty` | `markdown:add-metadata-property` | properties | Mod+; |
| table commands (insert/move/delete row and column, align, sort) | `editor:table-*` | tables | — |
| `toggleSourceMode` | `editor:toggle-source` | livePreview | — |
| `openAsText` | none | editor | title action |
| `agentBridge` | none | copyLinkForAgent | none (context menu) |
| `quickSwitcher` | `switcher:open` | quickSwitcher | none by default (Mod+O conflicts with VS Code's Open) |

Rules:

- Rows marked "verify" use a default to be confirmed in Obsidian 1.13.7
  (Settings → Hotkeys) before it is bound. Record the observation (§21.4).
- Host shortcuts that collide with editor keys while the editor has focus
  (Vim's Ctrl-O, Ctrl-B and others) are consumed only while the `vim` plugin is
  active (`lumiere.markdown.plugin.vim` context key), as the source's
  `consumeVimHostShortcut` does. The list moves to the `vim` manifest.
- The editor title bar keeps **Add File Property** and **Open as Text**
  (Copy for Agent was removed by owner decision, §17). **Toggle Outline** goes away
  (§13 outline).
- The right-click menu uses VS Code's `webview/context` menu with
  `webviewSection` for static commands (formatting, Copy Link for Agent),
  after VS Code's own Cut, Copy and Paste, as Obsidian's menu starts with them.
  Context-dependent items (tables, property chips) keep in-editor menus via
  the `menu` service and `editor/menu`.
- Vim ex commands `:w`, `:q`, `:wq`, `:x`, `:u`, `:red` map to host actions
  (kept from `editor/vim.ts`).

## 15. Settings

### 15.1 Editor settings (Obsidian → Lumière)

Defaults are Obsidian's application defaults, except where the owner decided
otherwise (2026-10-09): line numbers on, readable line length off, Mermaid on.
Vim stays off; the owner's Vim profile is a test profile, not the product
default (§25).

| Obsidian setting | Setting or plugin | Default |
| --- | --- | --- |
| Default editing mode | `lumiere.markdown.editor.defaultMode` (`livePreview` \| `source`) | `livePreview` |
| Readable line length | `lumiere.markdown.editor.readableLineLength` | `false` (owner decision; `true` gives the default theme's 700 px measure) |
| Strict line breaks | `lumiere.markdown.editor.strictLineBreaks` | `false` |
| Properties in document | `lumiere.markdown.properties.display` | `visible` |
| Show inline title | plugin `inlineTitle` | off (owner decision, 2026-10-09) |
| Fold heading, Fold indent | `lumiere.markdown.folding.heading`, `.indent` | `true`, `true` |
| Show line numbers | plugin `lineNumbers` | on (owner decision), following `editor.lineNumbers` |
| Show indentation guides | plugin `indentGuides` | on |
| (no built-in equivalent) Sticky headings | plugin `stickyScroll`; `lumiere.markdown.stickyScroll.maxLines` | off; 5 rows |
| Right-to-left | `lumiere.markdown.editor.rightToLeft` | `false` |
| Spellcheck | plugin `spellcheck` | on |
| Auto pair brackets / Markdown syntax | `lumiere.markdown.autoPair.brackets`, `.markdown` | `true`, `true` |
| Smart lists | plugin `smartLists` | on |
| Indent using tabs, Tab indent size | `lumiere.markdown.editor.useTabs`, `.tabSize` | `true`, `4` |
| (Workshop-specific) Text-selection edge-scroll speed | `lumiere.markdown.editor.dragScrollSpeed` (multiplier 1–10; 1 restores CodeMirror speed) | `4` |
| Auto convert HTML | plugin `pasteHtml` | on |
| Vim key bindings | plugin `vim` | off |

### 15.2 Files and links

| Obsidian setting | Setting | Default |
| --- | --- | --- |
| New link format | `lumiere.markdown.links.newLinkFormat` (`shortest` \| `relative` \| `absolute`) | `shortest` |
| Use [[Wikilinks]] | `lumiere.markdown.links.useWikilinks` | `true` |
| Automatically update internal links | `lumiere.markdown.linkUpdates.mode` (`prompt` \| `always` \| `never`) | `prompt` |
| Default location for new notes | `lumiere.markdown.files.newNoteFolder` (empty = vault root, `.` = current folder, or a path) | empty |
| Default location for new attachments | `lumiere.markdown.files.attachmentFolder` (same forms, plus `./sub`) | empty |
| Excluded files | `lumiere.markdown.vault.excludedFiles` (globs) | `[]` |
| (no equivalent) | `lumiere.markdown.vault.rootMarkers` | `[".obsidian"]` |
| (no equivalent) | `lumiere.markdown.links.folderNote` | `""` |

Settings are resource-scoped, so a vault (workspace folder) can carry its own,
as Obsidian keeps settings per vault. Core plugins keep owning these settings.
The optional host-only `obsidianCompat` feature supplies in-memory candidates
from `app.json` through a disposable configuration provider. Every applicable
explicit VS Code inspect layer, resolved for the document URI and Markdown
language, takes precedence; package defaults come last. It never writes VS Code
settings. Vault root discovery stays in core; the compatibility config folder
defaults to `.obsidian` and is independently configurable and contained.

The feature also provides a vault/document-scoped `types.json` registry. Wire
`aliases` and `tags` stay distinct; UI `list` maps to wire `multitext`. It retains
last-good snapshots and unknown entries. The current host has no atomic
conditional-write API, so property-type edits reject before any filesystem
mutation, including creating missing files or folders. Writes require an adapter
that atomically replaces the expected source or rejects without writing; a
separate read/check followed by write or rename is insufficient. Each vault
retains its identity through async work and profile replacement.
The existing properties UI keeps its preference storage; the scoped service is
available for a later consumer. See [the plugin contract](src/plugins/obsidianCompat/README.md).

### 15.3 Deliberate divergences from Obsidian

- Save, undo, redo, hot exit, file watching and settings storage are VS
  Code's.
- Theme follows VS Code's colours (headings and spacing follow Obsidian's
  default theme scale, as on the source branch).
- Link updates on rename ask first by default.
- The outline, backlinks, tags and plugin management use native VS Code views
  and Settings, not panes inside the editor.
- External application links (`obsidian://`, `zotero://` and similar) need
  confirmation (Obsidian also asks); links in VS Code's own scheme
  (`vscode://`, `cursor://`) open directly.

## 16. Opening links

The host `links` plugin owns one pipeline:

1. The webview `link/click` bail: in-note fragments (`#Heading`, `#^block`)
   scroll locally (`noteFragment`, as now).
2. Otherwise the webview sends `links.open { href, source, modifiers }`.
3. The host validates the request and runs `bail('links/open', request)`.
   Other plugins and API plugins may claim it (for example LLM Wiki's source
   links).
4. Default handling:
   - `http(s):` and `mailto:`: `env.openExternal`;
   - the host's own scheme (`env.uriScheme`): `env.openExternal`, which VS Code
     routes to the target extension's URI handler;
   - other schemes: a modal confirmation, then `openExternal`;
   - otherwise resolve with `vault.resolveLink` (wikilinks) or relative to the
     source (Markdown links); then
     - Markdown notes open in `lumiere.markdown.editor`, or in place in the
       same group with Mod for the side, and pass the fragment to `navigate`;
     - folders: §12.3;
     - other files: `vscode.open`, so PDFs use PDF Workbench when it is the
       default;
     - unresolved wikilinks: create the note in the new-note folder
       (`lumiere.markdown.files.newNoteFolder`) and open it, as Obsidian
       does.

## 17. Copy Link for Agent (`agentBridge` plugin)

Owner decision (2026-10-09): the Copy for Agent command, Mod+Alt+C, its
title button and menu items are removed; plain Ctrl/Cmd+C copies text.
The single remaining action was then renamed **Copy Link for Agent** (it
was Ask Agent about Selection); it keeps producing the text below, copies
it, and opens a chat only when the editor's own chat is the only agent or
`copyLinkForAgent.target` forces one. Nothing was published, so the
command and setting are `copyLinkForAgent` (formerly `copyForAgent`,
`askAgentAboutSelection`, `askAgent.target`) with no migration, and the
public API has no agent methods or service. Review fixes (round 1) settled the names
shared with Agent PDF Viewer: plugin `agentBridge`, service class
`AgentHandoff`, command `copyLinkForAgent`; the plugin setting is now
`lumiere.markdown.plugins.agentBridge.enabled`. The text format is shared with
Agent PDF Viewer and specified in `docs/agent-handoff-format.md`.

Keep the LLM Wiki clipboard wording (`formatMarkdownAgentReference`):

```text
@notes/attention.md#12-18
```

- The path is workspace-relative; in multi-root or non-file workspaces the
  reference uses the full URI. Lines are 1-based, from source offsets (a
  selection ending at column 0 excludes that line, as now).
- Line numbers must match the file on disk. With unsaved changes, interactive
  Copy Link for Agent offers **Save and Copy**, **Copy Text Only** or **Cancel**, as
  PDF Workbench does.
- The selection is captured from the webview with `editor.captureSelection`
  after a flush, and is rejected if the document version moved (as
  `captureActiveSelectionContext` does). A table cell selection maps to its
  source range.
- Available from the editor context menu, the selection menu and the
  command palette.

### 17.1 Bridge envelope

Copy Link for Agent still copies the text above and may open a chat. A
separate `bridge` plugin publishes a versioned JSON envelope
(`docs/bridge-envelope.md`) for the same selection and does not open a
chat. Agent PDF Viewer stays a second extension: `vscodeEmbedPdf.bridge.envelope`
is called only when that command is registered. Wiki copy commands use the
envelope and the clipboard text, and they never start an agent. The envelope
is a workbench protocol, not OKF metadata, and it is not a shared
Back/Forward history.

## 18. Public API v1 and outside extensions

### 18.1 Shape

The activation export is a frozen object with `apiVersion: 1`, as in PDF
Workbench. Public declarations ship in `dist/api/` from `src/host/api/types.ts`.

```ts
export interface MarkdownWorkshopApi {
  readonly apiVersion: 1;

  // Editors and documents
  getEditors(): readonly EditorSnapshot[];
  getActiveEditor(): EditorSnapshot | undefined;
  open(uri: Uri, options?: { viewColumn?: ViewColumn; preserveFocus?: boolean; reveal?: SourceTarget }): Promise<EditorSnapshot>;
  reveal(editorId: EditorId, target: SourceTarget, options?: { focus?: boolean }): Promise<void>;
  //   SourceTarget = { from: number; to: number } (source offsets) | { line: number } | { fragment: string }

  // Selections
  getSelection(editorId: EditorId, options?: OperationOptions): Promise<SelectionSnapshot | undefined>;

  // Vault (read-only)
  resolveLink(linktext: string, source: Uri): Uri | undefined;
  getMetadata(uri: Uri): NoteMetadata | undefined;
  getBacklinks(uri: Uri): readonly Backlink[];
  readonly onDidResolveLinks: Event<{ readonly vault: Uri }>;

  // Plugins
  getPluginCatalog(): readonly PluginDescriptor[];
  getPlugins(editorId: EditorId): readonly PluginState[];
  setPluginEnabled(id: string, enabled: boolean, scope: ConfigurationScope): Promise<PluginChangeResult>;
  resetPluginOverride(id: string, scope: ConfigurationScope): Promise<PluginChangeResult>;
  openPluginSettings(resource?: Uri): Promise<void>;
  plugin(definition: ExternalPlugin): PluginHandle;

  // Events
  readonly onDidOpenEditor: Event<EditorSnapshot>;
  readonly onDidCloseEditor: Event<{ readonly editorId: EditorId }>;
  readonly onDidChangeActiveEditor: Event<EditorSnapshot | undefined>;
  readonly onDidChangeDocument: Event<DocumentState>;
  readonly onDidChangeSelection: Event<{ readonly editorId: EditorId; readonly hasSelection: boolean }>;
  readonly onDidChangePlugins: Event<{ readonly editorId: EditorId; readonly states: readonly PluginState[] }>;
}
```

`SelectionSnapshot` is frozen and host-held: `{ id, editorId, documentId,
version, isDirty, sourceSha256?, from, to, startLine, endLine, text }`.
Errors use PDF Workbench's codes (`EditorNotFound`, `InvalidArgument`,
`PluginDisabled`, `StaleSelection`, `DocumentDirty`, `SourceChanged`,
`Cancelled`, `DuplicateContribution`, …).

### 18.2 External host plugins

An outside extension contributes a **real plugin**, not only a description.
Authoring for user / third-party plugins: root [AGENT.md](AGENT.md) (see also
[API.md](API.md) § External plugins).

```ts
const wiki = workbench.plugin({
  id: 'llm-wiki.queries',                 // namespaced under the owner
  ownerExtensionId: 'llm-wiki.llm-wiki-vscode',
  title: 'Wiki Queries',
  description: 'Badges for Queries that cite this note.',
  defaultEnabled: true,
  inject: { required: ['markers', 'editors'], optional: ['vault'] },
  apply(ctx) {
    ctx.on('editor/opened', (editor) => refreshMarkers(ctx, editor));
    ctx.on('links/open', (request) => isWikiSourceLink(request.href) ? openWithWiki(request) : undefined);
  },
});
context.subscriptions.push(wiki);
```

- External plugins run in an isolated child context that can see only the
  public services: `editors`, `vault` (read-only facade), `markers`,
  `commands` (IDs restricted to the owner's namespace), `links` events,
  `codeBlocks` (§18.4) and `logger`. Internal services stay hidden.
- They follow the same lifecycle, gating and error isolation. Enablement
  comes from `lumiere.markdown.plugins.external`.
- IDs are namespaced under an installed owner extension; namespaces prevent
  accidents but do not authenticate extensions sharing a host (same caveat as
  PDF Workbench).

### 18.3 Markers

`ctx.markers.set(editorId, markers)` (and `PluginHandle.setMarkers` for
convenience) replaces one plugin's markers for one editor atomically:

```ts
interface SourceMarker {
  id: string;
  from: number; to: number;          // source offsets in the document version below
  documentVersion: number;           // from EditorSnapshot / DocumentState
  label: string;                     // ≤ 120 characters
  tooltip?: string;                  // ≤ 1000 characters; plain text
  actionId?: string;                 // runs a registered marker action
}
```

The webview maps markers through edits made after `documentVersion` (as
`showAnnotations` does now), drops ranges that become invalid, and attaches
badges after inline text or after rendered blocks so they stay accessible.
Limit: 1,000 markers per plugin per editor. LLM Wiki's Query annotations
become an external plugin that resolves its anchors and sets markers.

### 18.4 Data-only webview contributions

- **Selection and title actions**, as in PDF Workbench: plain labels and IDs;
  the callback runs in the host.
- **Code block processors**: `ctx.codeBlocks.register({ language, render(source, context, token) })`
  returns `{ markdown }` or `{ html }`. The webview `codeBlocks` plugin claims
  the language in `render/fence`, asks the host, sanitizes the result and
  caches it by language and source hash. This is Obsidian's
  `registerMarkdownCodeBlockProcessor` without running outside code in the
  webview.

### 18.5 Webview modules (v2, designed now)

The VS Code Markdown preview lets extensions add `markdown.markdownItPlugins`
and `markdown.previewScripts`. Lumière v2 adds:

```json
"contributes": { "lumiere.markdown.webviewPlugins": [{ "id": "acme.wavedrom", "module": "./dist/wavedrom.js", "styles": ["./dist/wavedrom.css"] }] }
```

- Modules are ES modules exporting a webview plugin (`name`, `inject`,
  `apply`). They load only in trusted workspaces, only when enabled, and only
  from installed extensions' folders (added to `localResourceRoots`).
- Shared modules (`@codemirror/*`, `@lezer/*`, the kernel's public types) are
  provided through an import map, so plugins do not bundle a second copy of
  CodeMirror (`instanceof` checks would fail). This needs the build to emit
  those packages as separate ESM files (§22).
- Out of scope for v1 except keeping the import-map build working in a test.

## 19. Security

- CSP: `default-src 'none'`; scripts by nonce and `webview.cspSource`; styles
  from `cspSource` plus inline style attributes (needed by CodeMirror);
  images from `cspSource`, `https:`, `data:`, `blob:`; media from `cspSource`,
  `https:` and `blob:`; `frame-src https:`; fonts from `cspSource` and
  `data:`; `connect-src` from `cspSource` and `blob:` (resource and worker
  fetches). In untrusted workspaces, drop remote images, media and frames.
- DOMPurify sanitizes all rendered HTML. Iframes are sandboxed and lazy;
  graphics (MathJax, Mermaid) go through the graphics sanitizer. The
  LLM Wiki-specific source-link exception in `render/sanitize.ts` is replaced
  by the general scheme policy of §16.
- All messages are schema-checked; host handlers re-check containment, note
  identity (`resources.knows`) and line expectations (task toggles).
- Resource access is confined to the vault root (§12.4) plus `dist/`.
- `capabilities.untrustedWorkspaces: { supported: "limited" }`: editing and
  rendering work; remote content, external plugins' webview modules and
  external host plugins' code block processors are off.
- Mermaid runs with `securityLevel: "strict"`.

## 20. Performance

Budgets, measured with the source's `scripts/measure-editor.ts` harness (port
it to `scripts/measure-editor.ts` and keep its fixtures):

| Measure | Budget |
| --- | --- |
| Keydown to next frame, median, 160 KB tables-and-footnotes note | ≤ 12 ms (source: 9.7–11.1 ms) |
| Same, 930 KB long-paragraph note | ≤ 10 ms (source: 7.8–7.9 ms) |
| First visible editor, 140 KB prose | ≤ 300 ms |
| Turning a plugin on or off in an open editor | ≤ 100 ms to the next frame |
| Vault index, 10,000 notes, cold | progress shown; host blocked < 50 ms at a time |
| Vault index, warm start | ≤ 1 s for 10,000 unchanged notes |

These are headless measurements, not native presentation latency or a
comparison with Obsidian. Record raw samples with each result.

## 21. Testing

### 21.1 Unit (`pnpm test`, `tsx --test`)

- Kernel conformance: lifecycle transitions, gating and re-gating, service
  replacement, effect order, event modes, error isolation, `update` and
  `reconfigure`, child disposal, `UndeclaredService`, caller-bound services.
- Composition (§5.10): for every feature plugin, toggling it off and on and
  changing its config each leave the editor's ordered extension list equal to
  a fresh start with the same settings. Seeded random sequences of toggles
  over all features end equal to a fresh start. No feature plugin sets an
  editor-wide setting with one winner. Disabling a plugin removes its
  view-state contribution and leaves other plugins' state intact.
- Pure modules: dialect, metadata, footnotes, properties YAML edits and
  ordering, tables model and operations, search parse and evaluate, fuzzy
  scoring, authority and coordinates, RPC schemas, agent reference format.
- Vault: link resolution table tests (each step of §12.3, ambiguity, case,
  `./`, `../`, `/`, aliases, subpaths), incremental re-resolution, persistence
  round trip, using an in-memory file system behind the `workbench` adapter.
- Contributions: `package.json` equals generator output; manifests match the
  host and webview registries; every event call site matches its declared
  mode.
- Host plugins run against `test/support/vscode-fake.ts`.

Unit tests are the default new automated coverage. Browser/native additions
require explicit owner approval. Pure editing commands and CodeMirror state
logic are tested on `EditorState` without a browser.

### 21.2 Smoke suites

`pnpm test:browser` (the webview against `test/browser/fake-host.ts`) and
`pnpm test:vscode` (the VSIX in an isolated `/tmp` profile) are small sanity
checks that the editor boots, edits, saves and undoes, with later owner-approved
targeted regressions. They are kept passing; new cases need explicit owner
approval. The source branch's browser suites, fuzzers and native scenarios are
not ported. Run the existing suites after `pnpm check`, in that order, before
every push (`pnpm check:full`). Native tests are local only, not GitHub Actions.

### 21.3 Computer-use acceptance

The owner accepts the extension by using it, with computer use, against
`docs/MANUAL_TEST_PLAN.md`. The plan is grouped by plugin; each scenario names
a note in `test/fixtures/vault`, the steps and the expected result. It covers
the retired source scenarios, every command and setting, turning each plugin
off and on, two panels of one note, external edits, reload recovery and the
API through a sample external plugin.

### 21.4 Obsidian parity

`docs/PARITY.md` holds one row per behaviour in §13–§15: the action, the
Obsidian 1.13.7 observation (date, how observed), our result and how it was
checked. Use a disposable vault (never the owner's). Rows stay "not observed"
until the owner's computer-use pass compares them with the live reference.

## 22. Build and toolchain

Same toolchain as PDF Workbench: pnpm, TypeScript (strict,
`noUncheckedIndexedAccess`), esbuild, ESLint flat config with
`consistent-type-imports`, Playwright, `@vscode/vsce`. Prettier (default
options) formats the code, and `pnpm check` runs `prettier --check` first.
ESLint also enforces the readability limits in `AGENTS.md` ("Code norms");
`test/unit/lint-rules.test.ts` keeps the limits and the list of inline
exceptions from changing unnoticed.

| Output | Entry | Format |
| --- | --- | --- |
| `dist/extension.js` | `src/host/extension.ts` | CJS, node20, `vscode` external |
| `dist/webview/editor.js` (+ chunks, `editor.css`) | `src/webview/main.ts` | ESM, splitting, chrome120. MathJax, Mermaid and Prism grammars stay lazy chunks |
| `dist/workers/vault.cjs` | `src/workers/vault.ts` | CJS, node20 |
| `dist/workers/search.cjs` | `src/workers/search.ts` | CJS, node20 |
| `dist/api/**/*.d.ts` | `src/host/api/types.ts` | `tsc` declarations |

`tsconfig` projects enforce the layers:

- root: `src/shared`, `src/markdown` (and `packages/core`) with `lib: ES2022`, no DOM,
  no types;
- `src/host`: adds node and vscode types;
- `src/webview`: adds DOM;
- `src/plugins`: two projects, one compiling `**/host.ts` and its imports
  with host types, one compiling `**/webview.ts` and its imports with DOM.

Keep the Prism esbuild plugin (`scripts/prism.mjs`). Generate
`THIRD_PARTY_NOTICES.md` like PDF Workbench. `.vscodeignore` is an allowlist
of `dist/` outputs and the docs.

## 23. Boundaries with LLM Wiki and PDF Workbench

- No runtime dependency on either. Both are optional neighbours.
- LLM Wiki keeps its editor and identifiers until a separate migration
  decision. If both are installed, users choose with **Reopen Editor With…** or
  `workbench.editorAssociations`.
- LLM Wiki-specific behaviour from the source that does not move: Query
  annotation index and diagnostics, `.llm_wiki_anchor` files, generated
  `vscode://llm-wiki…/open-anchor` links (they open via the host scheme rule
  in §16 and LLM Wiki's URI handler), Add to Chat into Cursor's composer,
  knowledge graph, repository sync, learning notes, terminal bridge,
  markdownlint and link diagnostics, Git diff.
- PDF links open with `vscode.open`. A `page` fragment is passed through as
  `#page=N`; PDF Workbench reads it.

## 24. Problems in the source to fix while porting

1. `src/shared/host-event.ts` uses `window`; `shared/edit-group.ts` is a
   CodeMirror annotation used only by the webview. Shared code must be pure.
2. Three link resolvers with different rules and none matching Obsidian (§12).
3. Whole-workspace `findFiles` and reads on link clicks, tag clicks, suggestion
   refreshes and query runs (§12).
4. The Lezer parser is configured in four places (§10.1).
5. The markdown-it renderer is a singleton with every feature built in, and
   the Properties sheet's HTML lives in the Markdown layer (§10.3).
6. Ad-hoc request IDs and pending maps in six places (§8.4).
7. `DocumentSession.receive` mixes document sync with links, search, tags,
   tasks, clipboard and commands, and hard-codes the LLM Wiki view type (§8.3).
8. `MarkdownEditorProvider` (752 lines) mixes panels, rename, annotations,
   selection capture and property-type storage (§9.1).
9. `EditorApp.extensions()` encodes precedence in comments (§9.2).
10. Vim defaults to on and is stored in `workspaceState` rather than a setting.
11. Obsidian's editor commands (22 on `main`) were dropped on the branch;
    restore them as VS Code commands (§14).
12. Property-type scope uses an LLM Wiki heuristic (`AGENTS.md` plus
    `SCHEMA.md`) instead of the vault root.
13. `table/controller.ts` (952 lines) needs splitting into selection,
    keyboard, toolbar/menu and edit projection.
14. Two known intermittent failures in the source's (now retired) suites:
    table row drag with scrolling before a single drop, and the split-view
    footnote undo step. Include both behaviours in the manual test plan so
    the computer-use pass checks them.

## 25. Open questions (recommended defaults in bold)

1. **Name.** **Lumière** (pairs with PDF Workbench). Changing it is a
   find-and-replace across these documents and the manifest.
2. **Default editor for `*.md`.** **`priority: "option"`**, plus a command,
   **Use Lumière for Markdown in This Workspace**, that writes the
   workspace's `workbench.editorAssociations`. The alternative, `"default"`,
   would capture every README in code repositories.
3. **Defaults.** **Obsidian's defaults** (Vim and line numbers off, readable
   line length on), with the owner's profile as a test fixture; or the owner's
   profile as product defaults.
4. **Outline.** **Native view only**, or also keep the in-editor panel.
5. **Where Backlinks, Outgoing links and Tags appear.** **Explorer sections**
   (like PDF Outline), or a Lumière activity-bar container.
6. **Link updates on rename.** **`prompt`**, or Obsidian's always-update
   behaviour.
7. **Kernel.** **In-house (decided; Cordis is a reference only, §5.9)**, or depend on the
   `cordis` npm package.
8. **Reading view.** **Not in v1**, or add a read-only rendered mode.
