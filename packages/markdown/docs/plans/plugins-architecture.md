# One Workbench, two editor plugins: architecture and migration plan

Date: 2026-10-09 (SGT). Status: **plan only**. Nothing has been pushed or changed in either repository.
Request: *"let's just make both plugins, they can select file types to enable"*, plus **Marp compatibility**.

Sources read (read-only clones in `/workspace/repos/plan-plugins/`):

- `t04dJ14n9/vscode-markdown-workbench` at `continue-handover` (`aa393a9`, PR #1 open against `main`):
  AGENTS.md, docs/HANDOVER.md, DESIGN.md §0, §6, §18, §22, §23, §25, API.md, `src/host/**`,
  `src/plugins/editor/{associations,manifest}.ts`, `src/shared/{manifest,plugin-state}.ts`,
  `scripts/generate-contributions.ts`, `test/unit/lint-rules.test.ts`.
- `t04dJ14n9/vscode-embedPDF` at `test-and-fix-ui` (`d4a5d8b`, PR #1 open against `main`): all of `src/extension`,
  `src/shared`, package.json, build script, AGENTS.md, README. I also looked at the **diverged
  `pdf-workbench` branch** (2 commits ahead of `main`, 2026-10-04 PT, "PDF Workbench Phase 1–2", with
  `pdfWorkbench.*` commands, a status bar and a draft PDF API v1). See open question Q3.
- VS Code `editorResolverService.ts` (main), and `marp-team/marp-vscode` 3.6.1 (package.json,
  `src/utils.ts`, `src/commands/{export,toggle-marp-feature,show-quick-pick}.ts`).

---

## 0. Summary

**Recommendation: option (c), a hybrid that is mostly (a).** Ship **one extension**, built from the
existing Lumière repo, with two **built-in editor plugins**, `markdown` (the current editor)
and `pdf` (Agent PDF Viewer moved in with its git history). Add an **"editor plugin"** concept to
the kernel manifest so that a plugin can own a custom editor, its file types, webview assets,
commands, views and settings. Then add a **public API v2 extension point** so that a third-party
extension can register its own editor (an external editor plugin) and the host manages its file types
the same way. Option (b), with a separate extension per editor, stays available to outside authors
but is not used for our two.

**File-type selection.** The table in `package.json` stays static. A custom editor's
`selector.filenamePattern` cannot change at runtime, but VS Code honours a
`workbench.editorAssociations` entry for a contributed view type **even when the pattern is not in
its selector** (`editorResolverService.ts`, `findMatchingEditors`: *"The user setting should be
respected even if the editor doesn't specify that resource in package.json"*). So:

- Contribute each editor with a broad static candidate list. Markdown gets `*.md`, `*.markdown`,
  `*.mdx`, `*.mdown`, `*.mkd`, `*.mkdn`, `*.qmd` at `priority: "option"`. PDF keeps `*.pdf` at
  `"default"`, and turning it off writes an owned `"*.pdf": "default"` association (§2.3, Q7).
- A setting, `markdownWorkbench.fileTypes`, is a table `{ glob → editor plugin | "off" }`. The **Manage
  File Types…** quick pick (reachable from Manage Plugins) writes the table.
- A reconciler turns the table into `workbench.editorAssociations` entries at the same scope (user or
  workspace). It owns and edits only the entries it wrote.

**Marp.** Marp only renders inside VS Code's built-in Markdown **preview** (through
`markdown.markdownItPlugins`). Its export and toggle commands need `window.activeTextEditor`, and a
custom editor never has one. Recommended handling:

- Detect `marp: true` frontmatter the way Marp does.
- By default, keep Marp decks in our editor with Marp-aware rendering: slide dividers instead of
  `<hr>`, directive comments shown as chips, and the `style:` frontmatter left byte-for-byte intact.
- Add bridge commands: **Open Marp Preview to the Side** calls `markdown.showPreviewToSide(uri)`.
  **Export Slide Deck…** first shows the file in a text editor, then calls `markdown.marp.export`.
- Add a setting, `markdownWorkbench.marp.open: "workbench" | "textEditor"`. With `textEditor`, Marp
  decks go to VS Code's text editor, where Marp's own toolbar, IntelliSense and Ctrl+K V work.

**Phases:**

- P0: decisions and merging the two PR #1s.
- P1: host generalisation and file types (Markdown only, no behaviour change).
- P2: import the PDF history.
- P3: PDF as a built-in editor plugin.
- P4: migrating existing users.
- P5: Marp compatibility (can start right after P1).
- P6: cross-plugin features (PDF embeds and links in notes).
- P7: public API v2 for external editor plugins.
- P8: packaging, documentation, owner acceptance and archiving the old repo.

---

## 1. Target structure

### 1.1 What exists today

| | Lumière | Agent PDF Viewer |
|---|---|---|
| ID / view type | `t04dj14n9.vscode-markdown-workbench` / `markdownWorkbench.editor` (CustomTextEditor, `priority: option`, `*.md`, `*.markdown`) | `t04dj14n9.vscode-embedpdf` / `vscodeEmbedPdf.viewer` (CustomReadonlyEditor, `priority: default`, `*.pdf`) |
| Architecture | Cordis-style kernel (`src/kernel`): everything is a plugin (about 50), with manifests in `src/plugins/<id>/manifest.ts`. `package.json` contributions are **generated** from the manifests (`pnpm contributions --check`). Frozen public API v1 plus external host plugins. | Plain classes: `PdfPanels`, `PdfPanel`, outline view, 3 commands. React + EmbedPDF webview with a validated message schema. |
| Size (VSIX on box) | 8.95 MB (`dist/webview` about 29 MB unpacked: Mermaid, MathJax, Prism chunks; `extension.js` 1.46 MB) | 2.47 MB (`pdfium.wasm` 4.6 MB, `viewer.js` 3.0 MB) |
| Activation | `onLanguage:markdown` | implicit `onCustomEditor` |
| Rules | AGENTS.md: layers (kernel, shared and markdown are pure), plugin isolation via services and events, readability limits enforced by ESLint **and** `test/unit/lint-rules.test.ts` (which fails if a limit changes, an exception is added, or the `files` glob changes from `["src/**/*.ts"]`), Prettier, unit tests only plus small smoke suites, no push or publish without the owner's approval. | AGENTS.md: shared is pure, webview untrusted (`parseViewerMessage`), track panels not paths, LLM Wiki-compatible Copy for Agent. ESLint recommended only (no Prettier, no readability limits); a 325-line browser spec. |

Both are `"private": true` at 0.1.0 and have never been published, so there are no Marketplace users
to migrate. Only the owner's installs and any external callers (for example LLM Wiki or agent skills
calling `vscodeEmbedPdf.openLocation`) need care.

### 1.2 Options

**(a) One extension with built-in editor plugins (markdown, pdf) plus external plugins.**

- One VSIX of about 11.5 MB compressed (8.95 + 2.47; the code is mostly disjoint, so there is little
  dedup). That is well within normal sizes: Mermaid alone is bigger than all of EmbedPDF. Unpacked on
  disk it is about 40 MB.
- **Activation cost is unchanged** if the PDF host half loads lazily: the wasm and React bundle load
  only in a PDF webview, and the PDF host code is about 20 KB. The real activation risk is the
  opposite direction: a PDF-only user must not pay for vault indexing. The vault plugins must start
  only when the Markdown editor plugin is enabled and a Markdown panel opens or a vault command runs
  (P1 task).
- One settings namespace, one Manage Plugins, one Show Plugin Status, and one Copy for Agent family.
  Cross-plugin features (PDF embeds in notes, PDF links from notes) use **internal services**, not a
  frozen public API, and can share assets: the Markdown webview can lazy-load `dist/webview-pdf/pdfium.wasm`.
- Marketplace: one listing. Someone who wants only a PDF viewer installs the Markdown editor too, but
  can turn it off (file types set to `off`, plugin disabled) at zero runtime cost. Optionally publish a
  PDF-only build later from the same source (Q6).

**(b) Monorepo with a host extension and separate plugin extensions (via the API).**

- Hard constraints from VS Code:
  - A custom editor's `viewType` must be contributed in the **contributing extension's own**
    `package.json`, and only that extension can call `registerCustomEditorProvider` for it. The host
    can never "own" the file type of a plugin extension's editor. It can only steer it with
    `workbench.editorAssociations`.
  - API v1 has no editor or webview contribution (webview modules are v2, DESIGN §18.5).
- Costs:
  - Two installs and two activations, plus `extensionDependencies` ordering.
  - A frozen cross-extension API for everything shared: open location, selection, embeds.
  - Two release trains and duplicated Copy for Agent wording.
- Benefit: an independent PDF listing.

**(c) Hybrid (recommended).** Use (a) for our two editors. Design the editor-plugin manifest so
that the same descriptor can also arrive through **API v2** from an outside extension, which keeps
its own `contributes.customEditors` and provider (forced by VS Code). The host then:

- lists it in Manage Plugins and Show Plugin Status,
- offers its candidate patterns in Manage File Types,
- reconciles its associations,
- gives it the existing public services (agent references, links/open).

This gives the single host the user asked for without blocking a separately installable editor plugin
(for example a future EPUB or Excalidraw viewer).

### 1.3 Why (c)/(a) fits the repos' rules

- The PDF becomes `src/plugins/pdf/` (host half, pure location and agent-text modules) plus a
  separate webview app. The rule "every capability is a plugin under `src/plugins/<id>/`; reach other
  capabilities through injected services" is preserved: the Markdown links plugin injects an optional
  `pdf` service and never imports PDF internals.
- PDF code must then pass Lumière's `pnpm check` (Prettier, the readability limits,
  `consistent-type-imports`, the layer `no-restricted-imports`):
  - Formatting goes in its own commit.
  - Any limit violations are fixed by behaviour-preserving rewrites in their own commits, never by
    raising a limit or adding exceptions.
- **One rule needs the owner's approval:** the readability block covers `files: ["src/**/*.ts"]`,
  and `lint-rules.test.ts` pins that glob. The PDF viewer is `.tsx`. Leaving `.tsx` uncovered would
  be a loophole. Changing the glob to `src/**/*.{ts,tsx}` **tightens** the rules but edits a pinned
  test, so ask first (Q4). Also add `eslint-plugin-react-hooks` for the PDF webview only.
- Testing policy: Lumière allows unit tests only plus small smoke suites. The PDF browser
  spec is not part of "the source's suites" (that phrase refers to human-learning), but it is big.
  Proposed: keep it as `test/browser/pdf.spec.ts`, trimmed to a smoke set of about 6 scenarios. Move
  the rest into `docs/MANUAL_TEST_PLAN.md` and record it in `docs/TEST_LEDGER.md` (Q5). Never drop an
  assertion silently.
- AGENTS.md/HANDOVER.md say "Never modify ~/Code/vscode-embedPDF". The import works on a **fresh
  clone** run through filter-repo. The original repo is untouched, and archiving it later needs the
  owner's approval.

### 1.4 Proposed layout (inside the current repo)

```text
src/
├── kernel/ shared/ markdown/        unchanged (pure)
├── host/
│   ├── editors/                     NEW: editor-type registry, file-type reconciler, migration
│   └── api/                         v1 frozen; v2 additions in new files
├── plugins/
│   ├── editor/ …                    the Markdown editor plugins (unchanged IDs)
│   ├── pdf/                         NEW host half: manifest.ts, host.ts, panels.ts, panel.ts,
│   │                                outline-view.ts, commands.ts, location.ts (pure),
│   │                                agent-text.ts (pure), messages.ts (pure schema), README.md
│   ├── marp/                        NEW: detection, slide dividers, directive chips, bridge commands
│   └── pdfLinks/                    NEW (P6): PDF links and embeds in notes, injects `pdf` optionally
├── webview/                         Markdown editor app (unchanged)
└── webview-pdf/                     NEW: the React + EmbedPDF viewer app (from embedPDF src/webview)
```

The build adds an IIFE entry `dist/webview-pdf/viewer.js` and copies `pdfium.wasm` to it. The
`.vscodeignore` allowlist and `THIRD_PARTY_NOTICES.md` (EmbedPDF, PDFium, React) are extended.

---

## 2. How "select file types to enable" works

### 2.1 VS Code facts that constrain the design

1. `contributes.customEditors[].selector[].filenamePattern` is static. There is no API to add
   patterns, and no `when` clause on custom editors.
2. `priority: "default"` makes the editor open automatically for matching files. `"option"` only
   lists it in **Reopen Editor With…** and **Open With…**.
3. `workbench.editorAssociations` (`{ glob: viewType }`, with `"default"` meaning VS Code's text
   editor) overrides priority. VS Code also matches an association to a contributed view type **for
   globs outside its selector** (verified in `editorResolverService.findMatchingEditors`). So the
   user, or we, can route `README.md`, `*.qmd` or `docs/**/*.md` to our editor. Associations can be
   user-level or workspace-level.
4. A contributed but unregistered view type fails to open. So when an editor plugin is disabled, its
   provider must stay registered and **redirect**: `vscode.openWith(uri, "default", column)`, then
   dispose the panel.
5. The longest glob wins when several associations match. Write fixture tests for overlaps such as
   `*.md` and `*.marp.md`, and verify the exact rule in the native smoke run.

### 2.2 Settings and their meaning

```jsonc
// Window/resource scope; user or workspace.
"markdownWorkbench.fileTypes": {
  "*.md": "markdown",        // open in the Markdown editor by default
  "*.markdown": "markdown",
  "*.mdx": "off",            // offered in Reopen With…, never automatic
  "*.pdf": "pdf",
  "*.marp.md": "text"        // force VS Code's text editor
}
```

- The value is `<editor plugin id> | "off" | "text"`. The JSON schema uses
  `additionalProperties: { enum: [...] }`, so the Settings UI shows a key/value table with dropdowns,
  which is what "they can select file types" should look like there.
- Defaults: `{ "*.pdf": "pdf" }` only. This preserves today's behaviour: PDFs open in the viewer, and
  Markdown is an option (DESIGN §25.2: do not capture every README).
- `markdownWorkbench.plugins.pdf.enabled` and `markdownWorkbench.plugins.markdown.enabled` are the
  whole-plugin switches. When off, the plugin's associations are removed and its panels redirect.

**Reconciler** (`src/host/editors/associations.ts`, pure core plus a thin VS Code adapter):

- `plan(fileTypes, currentAssociations, owned) → { writes, removals, conflicts }`.
  - `pluginId → viewType`, `"text" → "default"`, `"off" →` remove our entry.
  - Only entries recorded as **owned** (kept in `globalState` and `workspaceState` per scope, with the
    previous value so it can be restored) are changed or removed.
  - If the user hand-mapped a glob to another editor, it is reported as a **conflict** and not
    overwritten. Show Plugin Status and Manage File Types show "*.pdf → handled by
    `other.viewer` (your setting)" with a "Use Workbench" action.
- It runs on activation, on `onDidChangeConfiguration` for `markdownWorkbench.fileTypes` and
  `plugins.*.enabled`, and when Manage File Types writes. It writes at the scope the user chose. It
  never writes user settings unprompted on first install: the defaults equal VS Code's static
  behaviour, so nothing needs writing until the user changes something.
- **Use Lumière for Markdown in This Workspace** (`markdownWorkbench.useForMarkdownInWorkspace`,
  §25.2) keeps its ID and message. It becomes a shortcut that sets the workspace `fileTypes` for
  `*.md` and `*.markdown` to `markdown`. `withMarkdownWorkbench` and its unit tests stay valid as the
  reconciler's write step.

### 2.3 Static contributions (generated)

- Each editor plugin's manifest declares `contributes.editors` (§3.1). `generate-contributions.ts`
  emits `customEditors` with the candidate patterns at `priority: "option"`. Two choices for PDF follow; the recommended one is the second.
- Why PDF moves from `default` to `option`: with `default`, turning the plugin "off" would need a
  `"*.pdf": "default"` association just to undo our own static claim, and VS Code would keep asking
  "which editor?" whenever another PDF viewer such as LLM Wiki is installed.
- With `option` plus the default `fileTypes` entry, the reconciler writes `"*.pdf":
  "markdownWorkbench.pdf"` at user scope once, on first activation. **Catch:** nothing activates the
  extension before the first PDF opens, because `onCustomEditor` fires only for an editor being
  chosen. So for PDF, add `onStartupFinished` (a few milliseconds, since nothing heavy starts) or
  accept that the first PDF needs "Open With…" once.
- **Recommended alternative (simpler, no startup write):** keep PDF at `priority: "default"`, and
  implement `"off"` and `"text"` for `*.pdf` as an owned `"*.pdf": "default"` association. Pick this
  unless the owner prefers the purely declarative model (Q7).

### 2.4 UI

- **Lumière: Manage File Types…** (new; also the first item of **Manage Plugins**). The
  palette is unrestricted.
  1. Pick the scope: "This workspace" or "All workspaces (user)".
  2. A multi-select quick pick grouped by editor plugin ("Markdown editor", "PDF viewer", external
     editor plugins). There is one row per candidate pattern, checked when routed to that plugin, and
     the description shows conflicts ("now: Hex Editor"). Last rows: "Add pattern…" for a custom glob
     such as `docs/**/*.md`, and "Open in Settings".
  3. Writing goes through `fileTypes`, and the reconciler then updates associations.
- **Show Plugin Status** gains a "File types" header row per editor plugin (`*.md`, `*.markdown` ·
  workspace). It works without an open note: today it requires an active Markdown editor.
- **Manage Plugins** keeps opening Settings at `markdownWorkbench.plugins`. Settings now also shows
  `markdownWorkbench.fileTypes` as the table.
- Editor title: **Open as Text** (exists) for Markdown. For PDF there is no text view; **Reopen With…**
  is enough.

---

## 3. Plugin API and kernel changes for editor plugins

### 3.1 Manifest: `contributes.editors`

```ts
editors?: readonly {
  id: string;                       // "markdown" | "pdf" → viewType markdownWorkbench.<id>
  displayName: string;              // "Lumière", "Workbench PDF Viewer"
  document: "text" | "readonly" | "custom"; // CustomTextEditor | CustomReadonly | CustomEditor (future edit)
  candidatePatterns: readonly string[];      // static selector, priority "option"
  defaultPatterns?: readonly string[];       // default fileTypes entries
  retainContextWhenHidden?: boolean;
  multipleEditorsPerDocument?: boolean;
  webview: { entry: string; styles?: string[]; extraRoots?: ("workspaceFolder" | "documentFolder")[]; csp?: { wasm?: boolean; workerBlob?: boolean } };
}[];
views?: …  // existing; add scope: "editor:<id>" so the generator emits activeCustomEditorId == 'markdownWorkbench.<id>'
```

- `generate-contributions.ts` emits `customEditors`, the `fileTypes` schema (enum of editor IDs),
  context-key `when` clauses, and `viewsWelcome`, which the PDF outline needs. Today the generator
  has no `viewsWelcome` and hard-codes the single custom editor.
- The command prefix stays `markdownWorkbench.` (Q1). PDF commands get `category: "PDF"` through a
  new per-command `category` field, so the palette still reads "PDF: Copy for Agent".

### 3.2 Host runtime

- `Workbench.registerEditor(open)` (`src/host/workbench.ts`) hard-codes `viewType` and the text
  editor. Generalise it to `registerEditor({ viewType, document, options }, open)` and keep
  `isActivePanel` per view type. Also generalise the PDF's `PdfPanels.update()` tab-reconciliation
  logic: both repos solved "active panel by tab, not by `webview.active`" separately. Keep one
  implementation (`src/host/editors/active-panel.ts`) with the unit tests from both.
- A new kernel service, `editors` (registry): which editor plugins exist, their view types, open
  panels per plugin, and the active panel. It publishes context keys `markdownWorkbench.activeEditor
  = markdown|pdf`.
- Each editor plugin's host half is a kernel plugin that `inject`s `workbench` and `editors` and
  registers its provider via `ctx.effect`. Disabling it switches the provider to redirect mode (§2.1,
  item 4) rather than unregistering it.
- **Lazy activation:** `bootstrap.ts` currently starts `vaultsHost`, `editorHost` and window plugins
  (Backlinks, Tags…) eagerly. Split the root into an always-on core (`document`, `editors`, `fileTypes`,
  `publicApi`, `commands`) and per-editor-plugin subtrees started on demand. PDF-only usage must
  never index a vault. Add a unit test that bootstrapping with only PDF enabled starts no vault fiber.
- `Settings` namespace per plugin: `markdownWorkbench.<pluginId>.*` (already the convention:
  `markdownWorkbench.links.*`). PDF settings start empty. Candidates: `pdf.reloadOnChange`,
  `pdf.defaultZoom`.

### 3.3 Mapping the PDF features

| Today (`vscodeEmbedPdf.*`) | In the Workbench |
|---|---|
| `PdfEditorProvider` (CustomReadonlyEditor) | `pdf` plugin host half, editor `{ id: "pdf", document: "readonly" }`; `PdfPanel` unchanged inside |
| `PdfPanels` + context keys `vscodeEmbedPdf.pdfActive`, `hasSelection`, `outlineLoading` | `editors` registry + `markdownWorkbench.pdf.active`, `.hasSelection`, `.outlineLoading`; old keys set too for one release |
| Explorer view `vscodeEmbedPdf.outline` "PDF Outline" + `viewsWelcome` | manifest `views: [{ id: "pdfOutline", scope: "editor:pdf" }]`; `viewsWelcome` from the generator |
| `copyForAgent` (enablement `hasSelection`, editor/title) | `markdownWorkbench.pdf.copyForAgent`; wording byte-identical (`agent-text.ts` unit tests move verbatim). Exposed through the internal `agent` service so the API v1 `copyForAgent` stays Markdown-only (frozen) and v2 adds `pdf.copyForAgent` |
| `openLocation(uri?, location?)`: callable by other extensions | `markdownWorkbench.pdf.openLocation` with the same signature. **`vscodeEmbedPdf.openLocation` kept as a hidden alias** (documented in README; LLM Wiki and agent skills may call it) |
| `goToOutlineItem` (hidden) | `markdownWorkbench.pdf.goToOutlineItem` (hidden) |
| Reload on change (file watcher, generation counter) | unchanged inside `PdfPanel`; watcher registered through `ctx.effect` |
| Webview messages (`parseViewerMessage`) | unchanged schema in `src/plugins/pdf/messages.ts` (pure). Optionally re-expressed with the kernel `Schema` later; not needed |
| `pdf-workbench` branch extras (status bar, page/zoom commands, keybindings, draft API) | port after the import as `pdf` plugin features (Q3) |

### 3.4 Cross-plugin features this unlocks (P6)

All of these work through optional service injection (`inject: { optional: ["pdf"] }`). When the PDF
plugin is off, everything falls back to today's behaviour: a card plus `vscode.open`.

1. **`[[paper.pdf#page=3]]` and `[label](paper.pdf#page=3&viewrect=…)` links in notes** open in the
   PDF plugin at that page and box. The links plugin claims `links/open` for `*.pdf` targets and calls
   `pdf.open(uri, location)`. That replaces DESIGN §23's `vscode.open` plus `#page=N` hand-off, which
   only worked because the viewer read the URI fragment.
2. **Copy-for-Agent links pasted into notes** (`Source: [x.pdf (page 3)](<x.pdf#page=3&viewrect=…>)`)
   are ordinary Markdown links, so item 1 makes them clickable round-trips with the box highlighted.
   Add a Live Preview badge, "p. 3 ▢", that marks a link as a PDF location.
3. **`![[paper.pdf#page=3]]` embeds**, as in Obsidian (`#page=N`, `#height=H`). Two steps:
   - Step 1 (cheap): the card shows "Open page 3" and the page count.
   - Step 2: render the page inline as a lazy chunk in the Markdown webview that loads `pdfium.wasm`
     from `dist/webview-pdf/`. This is possible only because the two plugins ship in one extension.
     It needs `'wasm-unsafe-eval'` and a blob `worker-src` in the **Markdown** webview CSP **only when
     the plugin is on**, which is a security review item. Alternatively, render a PNG in the PDF
     webview's engine on request and pass it to the note as an image. That keeps the note CSP
     unchanged but needs a hidden PDF panel; not recommended.
4. **From PDF to note:** "Copy as Embed" and "Copy as Link" (`![[paper.pdf#page=3]]`) from a PDF
   selection, and drag a selection into a note.
5. **PDF backlinks:** a "Notes Linking Here" view beside the PDF outline, using
   `vault.getBacklinks(uri)`. The vault index already records links and embeds to non-Markdown files.
6. **One Copy for Agent action** that works in either editor; the palette entry is routed by
   `activeEditor`.
7. **Marp to PDF:** export a deck and open the resulting PDF in the PDF plugin, which reloads on
   change. That gives a live slide-PDF preview.

---

## 4. Marp compatibility

### 4.1 How Marp for VS Code works (verified in marp-vscode 3.6.1)

- **Activation:** `onLanguage:markdown`. A document is a Marp deck when `languageId === "markdown"`
  and its frontmatter (a `---` block at **index 0**) contains `marp: true` (`/^(marp\s*: +)(.*)\s*$/m`,
  value exactly `true`).
- **Rendering:** only in VS Code's **built-in Markdown preview**. It uses `markdown.markdownItPlugins:
  true`, which extends the preview's markdown-it with Marp Core, plus `previewScripts` and
  `previewStyles`. Its themes come from `markdown.marp.themes` (CSS files or URLs). It has no editor
  of its own.
- **Language features on the text document:** directive IntelliSense, hover, diagnostics (unknown
  directives, slide content overflow), an outline extension, and an editor-title quick-pick button
  (`when: editorLangId == markdown`).
- **Commands:**
  - `markdown.marp.export` (HTML, PDF, PPTX, PNG, JPEG; needs a trusted workspace; PDF, PPTX and
    images need Chrome, Edge or Firefox).
  - `markdown.marp.toggleMarpFeature`, `markdown.marp.newMarpMarkdown`, `markdown.marp.showQuickPick`.
  - **Export and toggle read `window.activeTextEditor`** and do nothing useful without it.
- **Syntax:**
  - Slides are split by horizontal rules (`---`, `***`, `___`, `- - -`), or by headings when the
    `headingDivider` directive is set.
  - Directives are global in frontmatter (`theme`, `paginate`, `size`, `header`, `footer`, `style`
    with multi-line CSS, `math`, `headingDivider`). Local directives go in HTML comments
    (`<!-- paginate: false -->`); spot directives use an underscore (`<!-- _class: lead -->`,
    `<!-- _backgroundColor: … -->`). Any other HTML comment is a **presenter note**.
  - Image keywords go in the alt text: `![bg left:40% sepia](a.jpg)`, `![w:200px](b.png)`.
  - Scoped `<style scoped>` blocks.

### 4.2 Conflicts with our custom editor

1. **When our editor is the default for `*.md`** (workspace association), Marp's text-editor
   features are lost on decks: the toolbar button, IntelliSense, inline diagnostics, Ctrl+K V and
   "Open Preview to the Side" (the built-in markdown commands with no URI argument use the active
   text editor). Diagnostics still compute on the `TextDocument` and appear in Problems.
2. **Preview to the side still works if we pass the URI:** `markdown.showPreviewToSide(uri)`. The
   preview follows `TextDocument` changes, and our edits are `WorkspaceEdit`s on that document, so it
   updates live. **Scroll sync does not work** (the preview syncs only with text editors).
   Double-click in the preview opens the file through associations, so it comes back to our editor
   (acceptable).
3. **Export from our editor fails silently** unless a text editor for the file is active first.
4. **Rendering differences in Live Preview:**
   - **Separators:** `---` after a blank line is a `HorizontalRule` in our Lezer tree and also in
     Marp's markdown-it. `Text\n---` is a **setext H2 in both** (CommonMark), so parsing already
     agrees. The issue is presentation: we draw `<hr>`, which hides the deck structure.
   - **Comments:** directive and note comments are `HTMLBlock`s. DOMPurify strips comments, so the
     rendered block is empty until the caret reveals it. Directives become invisible, which is
     confusing.
   - **Frontmatter:** the Properties sheet shows `marp`, `theme` and `paginate` fine. The multi-line
     `style: |` CSS must survive property edits **byte-for-byte**, which needs a test.
   - **Images:** `![bg](x.jpg)` renders as a normal inline image (fine); Marp size keywords are ignored.
   - **Scoped styles:** `<style>` blocks are sanitized away and should be shown as source.

### 4.3 Recommended approach: a `marp` plugin (feature, default on)

1. **Detection:** a pure `isMarpDocument(text)` in `src/markdown/marp.ts` that mirrors Marp's regex
   exactly. Recompute on change; it is cheap because it reads the first block only. Context key
   `markdownWorkbench.isMarp`. Also `markdownWorkbench.marpInstalled`
   (`extensions.getExtension("marp-team.marp-vscode")`, refreshed on `extensions.onDidChange`).
2. **Setting:** `markdownWorkbench.marp.open: "workbench" (default) | "textEditor"`. With
   `textEditor`, `resolveCustomTextEditor` on a deck redirects with
   `vscode.openWith(uri, "default", column)`. A notification offers "Keep in Workbench for this
   file" (session allow-list), so **Reopen With → Lumière** is not bounced forever. A
   filename convention also works statically: `fileTypes: { "*.marp.md": "text" }`.
3. **Marp-aware Live Preview** (webview half, only while `isMarp`):
   - A `HorizontalRule` renders as a **slide divider widget** ("Slide 4", a thin rule with the
     number). It is revealed as source on the caret like any block. `headingDivider` turns
     the matching headings into dividers too.
   - **Directive comments** render as muted chips: "class: lead · this slide" for `_` spot
     directives, "paginate: false · from here" for local ones. Non-directive comments render as a
     "Presenter note" chip. On the caret they reveal as source, as today.
   - `<style>` / `<style scoped>` HTML blocks stay source with CSS highlighting, never sanitized
     into nothing.
   - Image alt keywords (`bg`, `w:`, `h:`, filters): `w:` and `h:` size the preview; `bg` shows a
     small "background" badge.
   - **The Outline view shows slides** ("1 · Title", "2 · …").
   - Marp **themes are not rendered** in our editor (non-goal). That is the preview's job.
4. **Bridge commands** (Note Actions entries when `isMarp`, palette when Marp is installed):
   - **Open Marp Preview to the Side:** `markdown.showPreviewToSide(uri)`. It works without Marp
     installed too (it then shows plain Markdown) and says so.
   - **Export Slide Deck…:** `window.showTextDocument(document, { viewColumn: Beside, preview: true,
     preserveFocus: false })`, then `executeCommand("markdown.marp.export")`. Refuse early, with
     Marp's own message, in untrusted workspaces.
   - **Toggle Marp:** our own frontmatter edit (pure, unit-tested; same result as Marp's toggle:
     insert `---\nmarp: true\n---\n\n` or flip the value). It works without Marp and needs no text
     editor.
   - Marp not installed: one action, "Install Marp for VS Code…" (`workbench.extensions.search`
     `marp-team.marp-vscode`), nothing else.
   - **No default keybinding** (follows HANDOVER: leave "verify" bindings unbound; Ctrl+K V belongs
     to the built-in preview).

### 4.4 Tests (unit-first, per AGENTS.md)

- `marp/detect.test.ts`: Marp's own cases: `marp: true`, `false`, quoted, frontmatter not at index 0,
  `...` terminator, CRLF, BOM, no frontmatter.
- `marp/slides.test.ts`: for fixture decks, slide boundaries from our Lezer tree **equal**
  markdown-it's `hr` tokens (markdown-it is already a dependency). This covers setext versus rule,
  `***`, `___`, `- - -`, rules inside fences and lists, and `headingDivider: 2`.
- `marp/directives.test.ts`: global, local and spot parsing; notes versus directives; case and
  whitespace.
- `properties` round-trip: editing `paginate` keeps the `style: |` CSS byte-for-byte.
- `marp/redirect.test.ts`: the pure decision `(mode, isMarp, allowListed) → redirect?`, plus the
  VS Code fake asserting `vscode.openWith(uri, "default", column)`.
- `marp/bridge.test.ts` (VS Code fake): preview called with the URI. Export calls `showTextDocument`
  **then** `markdown.marp.export`, in order. Untrusted workspace and Marp-absent paths. Toggle edits.
- Browser smoke (one scenario): a deck shows "Slide 2" divider widgets and directive chips.
- `docs/MANUAL_TEST_PLAN.md`: with real Marp in an isolated profile, check preview to the side
  updating live, HTML export from our editor, `marp.open: textEditor` redirect and keep-in-Workbench,
  and the `*.marp.md` association.

---

## 5. Migration plan

### P0: decisions and baselines (owner)

- Answer Q1–Q8 (defaults are given, so work can start without answers).
- Merge **Lumière PR #1** (`continue-handover`) and **embedPDF PR #1** (`test-and-fix-ui`)
  into their `main`s. Both are open and need the owner's approval.
- Decide what happens to `pdf-workbench` (Q3).
- Baselines: Lumière `pnpm check` 483/483, browser smoke 14/14, native 1/1 (per
  HANDOVER); embedPDF `pnpm check`, browser and native. Record the VSIX sizes (8.95 MB and 2.47 MB).

### P1: host generalisation and file types (Markdown only; no behaviour change)

- `contributes.editors` in the manifest. The generator emits `customEditors` from manifests (the
  hard-coded block goes). `pnpm contributions --check` must produce the same `package.json` except
  for the added candidate patterns.
- `Workbench.registerEditor` generalised. `editors` registry service, shared active-panel logic.
- `markdownWorkbench.fileTypes` plus the reconciler (pure `plan()` with ownership and conflicts),
  **Manage File Types…**, and the Show Plugin Status file-types rows. `useForMarkdownInWorkspace`
  reimplemented on top, with the same ID and messages.
- Redirect mode for a disabled editor plugin.
- Lazy bootstrap: per-editor subtrees; no vault fibers without a Markdown panel.
- Tests:
  - reconciler table: owned, foreign, `off`, `text`, scopes, restore previous;
  - generator snapshot;
  - redirect;
  - "PDF-only bootstrap starts no vault";
  - the existing `editor/associations.test.ts` still passes unchanged.
- Docs: DESIGN §6.4 and §25.2, README, a CHANGELOG entry.

### P2: import the PDF repository with history

On a **fresh clone** (never `~/Code/vscode-embedPDF` or the shared `/workspace/repos/vscode-embedPDF`):

```sh
git clone --no-local https://github.com/t04dJ14n9/vscode-embedPDF pdf-import && cd pdf-import
git filter-repo \
  --path-rename src/extension/:src/plugins/pdf/ \
  --path-rename src/shared/:src/plugins/pdf/shared/ \
  --path-rename src/webview/:src/webview-pdf/ \
  --path-rename test/unit/:test/unit/pdf/ \
  --path-rename test/browser/:test/browser/pdf/ \
  --path-rename test/fixtures/make-fixtures.mjs:test/fixtures/pdf/make-fixtures.mjs \
  --path-rename README.md:docs/pdf/README.md --path-rename CHANGELOG.md:docs/pdf/CHANGELOG.md \
  --path-rename AGENTS.md:docs/pdf/AGENTS.md \
  --invert-paths --path package.json --path pnpm-lock.yaml --path eslint.config.mjs \
  --path tsconfig.json --path tsconfig.base.json --path .github --path .gitignore --path .vscodeignore \
  --path CLAUDE.md --path LICENSE --path THIRD_PARTY_NOTICES.md --path scripts --path test/vscode
# (two passes in practice: renames first, then the --invert-paths pass)
git tag -l | xargs -r -n1 sh -c 'git tag -m "" "pdf/$0" "$0" && git tag -d "$0"'   # namespace tags
cd ../vscode-markdown-workbench && git checkout -b import-pdf
git remote add pdf-import ../pdf-import && git fetch pdf-import
git merge --allow-unrelated-histories --no-ff pdf-import/main -m "Import Agent PDF Viewer history"
```

- The result: `git log --follow src/plugins/pdf/pdf-panel.ts` shows the embedPDF history; blame
  works. `git subtree add --prefix=…` is the fallback. It is simpler but puts everything under one
  prefix, so later moves break `--follow` less gracefully. Prefer filter-repo.
- Next commits, each separate and in this order:
  1. Prettier formatting only.
  2. Wiring: tsconfig projects for `src/webview-pdf` (DOM + JSX), the build entry plus wasm copy,
     ESLint React hooks for `src/webview-pdf/**`. EmbedPDF and React dependencies join
     `package.json`, then run `pnpm notices`.
  3. Owner-approved: readability glob to `src/**/*.{ts,tsx}` (Q4).
  4. Behaviour-preserving rewrites for any limit violations, each with tests where pure logic is
     extracted.
  5. PDF unit tests run under `scripts/test.mjs`; trim the browser suite and record it in the ledger
     (Q5).
- `pnpm check` must be green at every commit after commit 2.

### P3: PDF as a built-in editor plugin

- `src/plugins/pdf/manifest.ts` (`kind: "feature"`, `defaultEnabled: true`, editor `pdf`, views
  `pdfOutline`, commands, `viewsWelcome`) and `host.ts` (provider, panels, outline, commands via
  `ctx.effect`). Panels are tracked per panel.
- Webview HTML and CSP kept as-is (`wasm-unsafe-eval` and blob worker for the PDF webview only).
- `.vscodeignore` allowlist adds `dist/webview-pdf/**`, excluding maps. New packaging check:
  **VSIX ≤ 13 MB** (a new budget, not a raised one).
- Native smoke: one PDF opens in `markdownWorkbench.pdf`, the outline shows, and Copy for Agent
  writes the expected text. That gives two native scenarios in total; still "one smoke suite".

### P4: migrating existing users (the owner's installs and external callers)

- **View type:** on activation, rewrite `workbench.editorAssociations` entries whose value is
  `vscodeEmbedPdf.viewer` to `markdownWorkbench.pdf` (user and workspace scopes; recorded as owned).
  Tabs restored with the old view type would fail to open if the old extension is gone. To cover
  that, register a tiny **compatibility provider** for `vscodeEmbedPdf.viewer`, contributed with no
  selector patterns, `priority: option`. It reopens the tab in the new view type, and goes away
  after one or two releases.
- **Old extension installed** (`t04dj14n9.vscode-embedpdf`): both claim `*.pdf`. Show one
  notification with "Disable Agent PDF Viewer" (opens the Extensions view on it; we cannot uninstall
  it ourselves) and stand down from writing `*.pdf` associations until it is gone.
- **Commands:** hidden aliases `vscodeEmbedPdf.copyForAgent`, `vscodeEmbedPdf.openLocation` (argument
  contract unchanged) and `vscodeEmbedPdf.goToOutlineItem`, all with `commandPalette when: false`.
  Old context keys are set as well for one release.
- **Settings:** embedPDF has none, so nothing to migrate. Lumière settings are unchanged
  (namespace kept, Q1). If Q1 chooses a rename, add a one-shot `inspect()`-based copier for every
  `markdownWorkbench.*` key at each scope, plus aliases for every command, in its own phase.
- **API:** v1 (`getExtension("t04dj14n9.vscode-markdown-workbench")`) stays frozen and identical. PDF
  API members arrive in v2 only.
- Tests (VS Code fake): association rewrite at each scope; ownership; alias commands forward their
  arguments; detection of the old extension.

### P5: Marp compatibility (§4)

- Can start right after P1. It depends only on the editor and file-type work, not on PDF.

### P6: cross-plugin features (§3.4)

- Order: PDF links from notes (claim, then open at page and box), Copy-for-Agent link round trip,
  embed card step 1, Copy as Embed from PDF, PDF backlinks view, inline page rendering in notes
  (step 2, after a CSP review).
- Each item is its own commit with unit tests: link parsing reuses `pdf-location.ts`; claim
  routing; fallback when `pdf` is disabled.

### P7: public API v2 for external editor plugins

- Add, without touching v1:
  - `api.registerEditorType({ viewType, displayName, candidatePatterns, ownerExtensionId })`, so the
    host lists the editor in Manage File Types and reconciles its associations;
  - `pdf` public service: `open(uri, location)`, `getSelection(editorId)`,
    `createAgentReference(selection)`, `onDidChangeSelection`.
- Reconcile with the `pdf-workbench` branch's draft `api-types.ts` contract (Q3).
- Update `API.md`, `dist/api` declarations and `declarations.test.ts`, plus a sample external editor
  plugin fixture.

### P8: release

- README and CAPABILITIES ("Markdown editor and PDF viewer plugins; choose file types"), CHANGELOG,
  `docs/MANUAL_TEST_PLAN.md` sections for PDF, file types, migration and Marp.
- Owner acceptance (Phase 9 of the existing plan).
- With the owner's approval: archive `vscode-embedPDF` with a README pointer, and mark its PR or
  branches superseded.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Writing `workbench.editorAssociations` surprises users or fights other extensions | Write only on explicit actions or settings; track ownership; never overwrite foreign entries; show conflicts. The defaults need no write (PDF stays `priority: default`, Q7) |
| Two PDF viewers (old extension, LLM Wiki) claim `*.pdf` | Detection and notice; the user picks via Manage File Types; the redirect provider avoids hard failures |
| PDF-only users pay Markdown activation cost (vault indexing, `onLanguage:markdown`) | Lazy per-editor subtrees (P1) with a unit test. `onLanguage:markdown` stays but starts nothing heavy |
| Importing PDF code that breaks the readability limits forces big rewrites | Budget for it in P2. Rewrites are behaviour-preserving with tests; never raise limits or add exceptions |
| Lint-rules test pins `src/**/*.ts`; `.tsx` escapes the limits | Owner approves tightening to `{ts,tsx}` (Q4) |
| History import mistakes (filter-repo on the wrong clone) | Always a throwaway clone; verify with `git log --follow` on 3 files before merging; the original repos are untouched |
| Parallel work: another job is editing `/workspace/repos/vscode-markdown-workbench`, and the `pdf-workbench` branch diverges from `test-and-fix-ui` | P1 starts only after PR #1 merges; Q3 decides `pdf-workbench` before P2 |
| The Markdown webview CSP widened for inline PDF pages | Only when the `pdfLinks` inline mode is on; review; keep the card fallback |
| Marp: export or toggle need `activeTextEditor`; no scroll sync | Bridge shows the text editor first; document the scroll-sync limit; offer `marp.open: textEditor` |
| Properties sheet rewrites a Marp `style:` block | Round-trip test before shipping the Marp plugin |
| A VSIX budget creep (Mermaid, MathJax, PDFium) | Packaging check ≤ 13 MB; lazy chunks |
| Cursor renders no inline editor-title actions (found on `pdf-workbench`) | Keep the PDF in-viewer actions menu; Note Actions already exists for Markdown |

---

## 7. Open questions for the owner (recommended default in bold)

- **Q1. Identity.** **Keep the extension ID `t04dj14n9.vscode-markdown-workbench` and the
  `markdownWorkbench.*` namespace.** That means zero migration, and API v1 stays valid. Change only
  the display name, to "Lumière" or "Workbench: Markdown & PDF". The alternative is one
  neutral rename now, while nothing is published: 157 occurrences in 76 files, generator-driven, its
  own phase. Note that `workbench.*` is VS Code's own namespace and cannot be used.
- **Q2. Repo.** **Import embedPDF into the Lumière repo with history (filter-repo)**, or
  create a new neutral repo and import both.
- **Q3. `pdf-workbench` branch** (status bar, page and zoom commands, draft PDF API, editing
  experiment). **Merge `test-and-fix-ui` first; port `pdf-workbench`'s finished pieces after P3 as
  `pdf` plugin features; import both branches' history**, or abandon it.
- **Q4.** **Tighten the readability rules to cover `.tsx`** (edits the pinned `lint-rules.test.ts`
  glob).
- **Q5. PDF browser suite.** **Trim it to a smoke set and move the rest to the manual plan and the
  ledger**, or keep all 325 lines.
- **Q6. Marketplace.** **One listing only**, or also a PDF-only build from the same source.
- **Q7. PDF default mechanism.** **Keep `priority: default` for `*.pdf`, with "off" as an owned
  `"default"` association**, or move to purely declarative `option` plus a first-run association
  write (`onStartupFinished`).
- **Q8. Marp default.** **`marp.open: "workbench"` with slide-aware rendering and bridge commands**,
  or send decks to the text editor by default. Also: should `*.mdx` and `*.qmd` be offered at all
  (OFM parsing will not understand JSX or Quarto chunks; offered as opt-in "off" rows by default)?
