# Obsidian settings audit for Markdown Workshop

Date: 2026-10-09 (SGT). This is research only. No code was changed.

**Sources**
- Obsidian 1.14.4 (`/workspace/tools/obsidian-1.14.4`). I unpacked `obsidian.asar` to a temp folder and read only the default-config object, the core-plugin defaults and the English UI strings, so the option names and defaults are exact for this version. I copied no code, CSS or assets.
- The official help source, `obsidianmd/obsidian-help`: `en/User interface/Settings.md`, `Appearance.md`, `Hotkeys.md` and `en/Plugins/*.md`.
- Test vault `.obsidian/app.json` and `appearance.json`. Both are `{}`, so the vault uses all defaults. `core-plugins.json` is quoted where it matters.
- Markdown Workshop, branch `continue-handover` at `f7105ac`, my own clone at `/workspace/repos/settings-audit`: `package.json` → `contributes.configuration`, `src/plugins/*`, and `src/webview/styles/base.css`.

**Legend**
- Status:
  - **have** `setting`: an equivalent exists.
  - **partial**: some of the behaviour exists.
  - **missing**: no equivalent.
  - **N/A (VS Code)**: VS Code already provides it, and the setting is named.
- Recommendation: **port**, **map** (read or follow a VS Code setting instead of adding our own), or **skip**.
- Priority: P1 means it shapes daily editing, P3 means niche. Effort: S under 1 day, M 1–3 days, L more than 3 days.
- `mw.` means `markdownWorkbench.`

**Note on the user's three decisions.** The `continue-handover` HEAD still has `plugins.lineNumbers.enabled=false` and `editor.readableLineLength=true`. The working copy in `/workspace/repos/vscode-markdown-workbench`, which another job is editing, already has `lineNumbers=true` and `readableLineLength=false`, and `diagrams` was already `true`. This report treats the user's decisions as the intended defaults.

---

## 1. Editor

| Obsidian option | default | what it does | workbench status | recommendation | priority | effort |
|---|---|---|---|---|---|---|
| Always focus new tabs (`focusNewTab`) | on | Opening a link in a new tab switches to it at once | partial. VS Code opens editors focused, and `Open Link to Side` exists. There is no "open in background" option | skip (VS Code tab model; `workbench.editor.*` covers it) | P3 | S |
| Default view for new tabs (`defaultViewMode`) | `source` (= Editing view) | Opens new tabs in Editing or Reading view | partial. There is no read-only Reading view. `mw.editor.defaultMode` only picks Live Preview or Source | port: add a `reading` choice once a reading view exists. Until then, document that Editing is always used | P2 | L (needs a reading mode) |
| Default editing mode (`livePreview`) | Live Preview | Live Preview or Source mode for new tabs | **have** `mw.editor.defaultMode` (`livePreview`) | keep | — | — |
| Show editing mode in status bar (core plugin `editor-status`) | on | Status bar toggle between Live Preview and Source | partial. The command `Toggle Live Preview/Source Mode` exists but has no status bar item | port: status bar item running the existing command | P2 | S |
| Readable line length (`readableLineLength`) | **on** | Caps the text column (~700px) and centres it | **have** `mw.editor.readableLineLength`. HEAD default is `true`; **the user chose `false`** | keep the setting with the user's default. Consider a width setting (`--file-line-width` is fixed at 700px) | P2 (width) | S |
| Strict line breaks (`strictLineBreaks`) | off | When off, single newlines show as line breaks in rendered views | **have** `mw.editor.strictLineBreaks` (`false`) | keep | — | — |
| Properties in document (`propertiesInDocument`) | `visible` | Frontmatter shown as a properties table, hidden, or as raw YAML (source) | **have** `mw.properties.display` (`visible`/`hidden`/`source`) | keep | — | — |
| Fold heading (`foldHeading`) | on | Fold arrow next to headings | **have** `mw.folding.heading` | keep | — | — |
| Fold indent (`foldIndent`) | on | Fold arrow for indented lists and blocks | **have** `mw.folding.indent` | keep | — | — |
| Line numbers (`showLineNumber`) | **off** | Gutter line numbers | **have** `mw.plugins.lineNumbers.enabled`. HEAD default is `false`; **the user chose `true`** | keep the plugin switch with the user's default. Optionally map to `editor.lineNumbers` (P3) | — | — |
| Indentation guides (`showIndentGuide`) | on | Vertical guides between nested list items | **have** `mw.plugins.indentGuides.enabled` (`true`) | keep | — | — |
| Right-to-left (`rightToLeft`) | off | Default text direction RTL | **have** `mw.editor.rightToLeft` | keep | — | — |
| Show Mermaid diagrams in notes (new in 1.14.x, stored in localStorage) | **off** (in 1.14.4 the toggle only enables when the stored value is `true`) | Renders ```` ```mermaid ```` blocks as diagrams | **have** `mw.plugins.diagrams.enabled`. Default `true`, which **the user chose**; it differs from Obsidian 1.14.4 | keep `true` (user decision). Rendering is strict-mode already | — | — |
| Auto-pair brackets (`autoPairBrackets`) | on | Pairs `()[]{}""''` | **have** `mw.autoPair.brackets` | keep. Optionally inherit `editor.autoClosingBrackets` (P3) | — | — |
| Auto-pair Markdown syntax (`autoPairMarkdown`) | on | Pairs `**`, `_`, `` ` ``, `==`, `~~` around a selection or the caret | **have** `mw.autoPair.markdown` | keep | — | — |
| Smart lists (`smartIndentList`) | on | Continues and renumbers lists on Enter, indents lists correctly | **have** `mw.plugins.smartLists.enabled` | keep | — | — |
| Indent using tabs (`useTab`) | on | Tab inserts `\t` (off means 4 spaces) | **have** `mw.editor.useTabs` (`true`) | keep. Offer "inherit from `editor.insertSpaces`" as a later option | P3 | S |
| Indent visual width (`tabSize`) | 4 | Rendered width of a tab character | **have** `mw.editor.tabSize` (4) | keep. Could fall back to `editor.tabSize` / `[markdown]` overrides | P3 | S |
| Convert pasted HTML to Markdown (`autoConvertHtml`) | on | Turns rich clipboard HTML into Markdown. Ctrl/Cmd+Shift+V pastes plain text | **have** `mw.plugins.pasteHtml.enabled` (the Shift paste bypass is implemented) | keep | — | — |
| Spellcheck (`spellcheck`) | on | Chromium spellchecker in the editor | **have** `mw.plugins.spellcheck.enabled`. It only sets the `spellcheck` attribute | keep. Verify that VS Code webviews actually underline words (Electron spellchecker languages are not exposed to extensions) | P2 (verify) | S |
| Spellcheck languages (Win/Linux) | system | Picks the dictionaries | missing; extensions can't control this | skip (not reachable from an extension) | P3 | — |
| Vim key bindings (`vimMode`) | off | CodeMirror Vim mode | **have** `mw.plugins.vim.enabled` (`false`). VS Code's `vscodevim` does not reach a custom editor | keep | — | — |
| Show inline title (`showInlineTitle`, an Appearance option in 1.14) | on | File name as an editable H1-style title | **have** `mw.plugins.inlineTitle.enabled` | keep | — | — |
| Show tab title bar (`showViewHeader`, Appearance) | on | Per-tab header with breadcrumb, back/forward and actions | N/A (VS Code). Tab and breadcrumbs come from `workbench.editor.showTabs` / `breadcrumbs.enabled`; `Note Actions` covers the "more options" menu | map / skip | P3 | — |
| Rebuild vault cache | button | Rebuilds the metadata cache | missing (vault index rebuilds on start) | port: command `Rebuild Vault Index` | P3 | S |

## 2. Files and links

| Obsidian option | default | what it does | workbench status | recommendation | priority | effort |
|---|---|---|---|---|---|---|
| Default file to open (`openBehavior`) | last opened | Opens the last note, a new note, a specific file or the daily note on launch | N/A (VS Code). `workbench.startupEditor` and window restore handle this | skip | — | — |
| Delete attachments when deleting files (`deleteUnlinkedAttachments`) | ask | Offers to delete attachments only that note used | missing | port (with the delete flow; see below) | P3 | M |
| Default location for new notes (`newFileLocation` + `newFileFolderPath`) | vault root (`root`, `/`) | Root, same folder as the current file, or a specified folder | **have** `mw.files.newNoteFolder` (`""` root, `.` current, or a path) | keep. One string covers all three Obsidian choices | — | — |
| Default location for new attachments (`attachmentFolderPath`) | `/` (vault root) | Root, same folder, `./sub`, or a fixed folder | **have** `mw.files.attachmentFolder` | keep | — | — |
| New link format (`newLinkFormat`) | `shortest` | Shortest, relative to the file, or absolute in the vault | **have** `mw.links.newLinkFormat` | keep | — | — |
| Use [[Wikilinks]] (`useMarkdownLinks=false`) | on | Generate `[[ ]]` / `![[ ]]` or Markdown links | **have** `mw.links.useWikilinks` (`true`) | keep | — | — |
| Automatically update internal links (`alwaysUpdateLinks`) | **off**, so Obsidian asks | Rewrites links when a file is renamed or moved | **have** `mw.linkUpdates.mode` `prompt`/`always`/`never` + `mw.plugins.linkUpdates.enabled` | keep (`prompt` = Obsidian default). Also note VS Code's built-in `markdown.updateLinksOnFileMove.enabled`, which handles Markdown links only; document how the two interact | P2 (doc) | S |
| Show all file types / Detect all file extensions (`showUnsupportedFiles`) | off | Lists unsupported files in the explorer, switcher and link suggest | partial. The VS Code explorer shows all files (`files.exclude`). The quick switcher and suggest decide on their own | port: `mw.quickSwitcher.showAllFileTypes` / suggest filter | P3 | S |
| Confirm file deletion (`promptDelete`) | on | Asks before deleting | N/A (VS Code) `explorer.confirmDelete` | map (any delete action in the workbench should go through VS Code's delete) | — | — |
| Deleted files (`trashOption`) | `system` trash | System trash, `.trash` in the vault, or permanent | N/A (VS Code) `files.enableTrash` (system trash). There is no `.trash` option | skip (`.trash` P3 at most) | P3 | S |
| Excluded files (`userIgnoreFilters`) | none | Hides paths from search, graph and unlinked mentions, and demotes them in the switcher and suggest | **have** `mw.vault.excludedFiles` | keep. Could also respect `files.exclude`/`search.exclude` (P3) | P3 | S |
| Override config folder | `.obsidian` | Config folder name | partial `mw.vault.rootMarkers` (`[".obsidian"]`) | keep | — | — |
| Allow URI callbacks (`uriCallbacks`) | off | x-callback-url for `obsidian://` | N/A (VS Code URI handler) | skip | — | — |
| Folder note (not an Obsidian setting) | — | — | workbench-only `mw.links.folderNote` | — | — | — |

## 3. Appearance

| Obsidian option | default | what it does | workbench status | recommendation | priority | effort |
|---|---|---|---|---|---|---|
| Base colour scheme (`theme`) | `system` | Light, dark or follow the OS | N/A (VS Code) `workbench.colorTheme`, `window.autoDetectColorScheme`. The webview uses `--vscode-*` colours | skip | — | — |
| Accent colour (`accentColor`) | theme default (purple) | Accent for links, active items and checkboxes | partial. `--accent` comes from `--vscode-textLink-foreground` | map (follow the theme). Optional `mw.appearance.accentColor` override | P3 | S |
| Themes (`cssTheme`) / community themes | default | Whole-app restyle | N/A (VS Code colour themes) | skip | — | — |
| Interface font (`interfaceFontFamily`) | system UI | Font for the app chrome | N/A (VS Code UI). The chrome belongs to VS Code | skip | — | — |
| Text font (`textFontFamily`) | system sans | Font for editing and reading views | partial. The prose uses `--vscode-font-family` (the UI font) with no setting | port: `mw.appearance.textFont` (empty = current behaviour) | **P1** | S |
| Monospace font (`monospaceFontFamily`) | system mono | Code blocks, inline code, frontmatter source | **N/A (VS Code)** `editor.fontFamily`, already read through `--vscode-editor-font-family` | map (already done) | — | — |
| Font size (`baseFontSize`) | 16 px | Text size in editing and reading views | partial. `--text-size: 16px` is hard-coded and ignores `editor.fontSize` and `[markdown]` overrides | port: `mw.appearance.fontSize` (default 16), or map to `editor.fontSize` when unset | **P1** | S |
| Quick font size adjustment (`baseFontSizeAction`) | off (in 1.14.4 defaults) | Ctrl/Cmd+scroll or pinch changes text size; Increase/Decrease font size commands | partial. VS Code zoom (`window.zoomLevel`, `editor.mouseWheelZoom`) scales the whole window, not the note text | port: Increase / Decrease / Reset font size commands (+ optional Ctrl+wheel) | P2 | S |
| Zoom level | 0 | Whole-app zoom | N/A (VS Code) `window.zoomLevel` | skip | — | — |
| Show inline title | on | (listed in Editor above) | **have** `mw.plugins.inlineTitle.enabled` | — | — | — |
| Show tab title bar | on | (listed in Editor above) | N/A (VS Code) | — | — | — |
| Show ribbon / ribbon configuration (`showRibbon`) | on | Left icon strip with command shortcuts | N/A (VS Code) Activity Bar + `editor/title` menu buttons | skip. The editor title menu could host Quick Switcher, Toggle mode and Daily note (P3) | P3 | S |
| Native menus / window frame style / translucency / custom app icon | platform default | OS chrome | N/A (VS Code) `window.titleBarStyle`, `window.menuBarVisibility` | skip | — | — |
| CSS snippets (`enabledCssSnippets`) | none | User CSS from `.obsidian/snippets/*.css` | missing | port: `mw.appearance.cssSnippets` (list of workspace CSS files injected into the webview; reading `.obsidian/snippets` gives Obsidian users their tweaks for free). Make the classes stable first | P2 | M |
| Open settings in new window | on | — | N/A (VS Code) | skip | — | — |

## 4. Core plugins and their options

The Obsidian default comes from each plugin's `defaultOn` in 1.14.4. "Workbench" means the plugin or feature in `src/plugins` and its switch.

| Obsidian option | default | what it does | workbench status | recommendation | priority | effort |
|---|---|---|---|---|---|---|
| **Backlinks** (plugin) | on | Linked and unlinked mentions pane | **have** `mw.plugins.backlinks.enabled`, default **off** (owner decision, see PARITY.md) | keep. Flag the default difference (§7) | — | — |
| Backlinks › Show backlinks at bottom of notes (`backlinkInDocument`) | off | Embedded backlinks under the note | missing | port: `mw.backlinks.inDocument` | P2 | M |
| Backlinks / Outgoing pane toggles (collapse results, show more context, sort, show search) | collapse off, context off | Pane view options | partial (tree view only) | port collapse/context as view-title toggles | P3 | S |
| **Outgoing links** | on | Links from the active note, including unresolved ones | **have** `mw.plugins.outgoingLinks.enabled`, default **off** (owner decision) | keep | — | — |
| **Outline** | on | Heading tree that follows the caret | **have** `mw.plugins.outline.enabled` | keep. Obsidian's "Auto-scroll to current section" toggle could be a view option (P3) | P3 | S |
| **Tags view** | on | Tag tree with counts, sort and nesting | **have** `mw.plugins.tags.enabled`, `mw.tags.viewSort`, `mw.tags.viewNested` | keep | — | — |
| **Page preview** | on | Hover preview of internal links (needs Ctrl/Cmd in the editor) | **have** `mw.plugins.pagePreview.enabled` (Ctrl/Cmd hover + keyboard) | keep | — | — |
| Page preview › require Ctrl/Cmd per source (Editing, Reading, Search/Backlinks, Tab header) | editor: on; others: off | Per-surface modifier requirement | partial (the editor always needs the modifier) | port: `mw.pagePreview.requireModifier` (bool) | P3 | S |
| **Templates** | on | Insert a template from a folder; `{{date}}`, `{{time}}`, `{{title}}` | **missing** | **port**: plugin + `mw.templates.folder`, `mw.templates.dateFormat` (`YYYY-MM-DD`), `mw.templates.timeFormat` (`HH:mm`) | **P1** | M |
| **Daily notes** | on | Opens or creates today's note | **missing** | **port**: plugin + `mw.dailyNotes.dateFormat` (`YYYY-MM-DD`), `.folder` (`""`), `.template` (`""`). Obsidian's "Open daily note on startup" is a 1.x option; skip it, VS Code owns startup | **P1** | M |
| Unique note creator (`zk-prefixer`) | off | New note with a timestamp prefix (`YYYYMMDDHHmm`), folder and template | missing | port later (reuses the templates/daily code) | P3 | S |
| **Word count** | on | Words and characters in the status bar (CJK aware) | **have** `mw.plugins.wordCount.enabled` (selection aware) | keep. Verify the CJK counting rule | P3 | S |
| **File recovery** | on | Snapshots every `intervalMinutes`=5, kept `keepDays`=7; browse and restore | partial. VS Code **Local History** does this (`workbench.localHistory.enabled`, `.maxFileEntries`, `.mergeWindow`). The custom editor saves through the TextDocument, so it should be covered | map to VS Code Local History + document how to reach it (Timeline view) | P2 (verify) | S |
| **Command palette** | on | Fuzzy command list; pinned commands | N/A (VS Code) Command Palette. Pinned commands = VS Code "recently used" | skip | — | — |
| **Quick switcher** | on | Open or create notes by name or alias | **have** `mw.plugins.quickSwitcher.enabled` | keep | — | — |
| Quick switcher › Show existing only / Show attachments / Show all file types | off / on / off | Filters unresolved links and attachments | missing (no switches) | port the three booleans (`mw.quickSwitcher.*`) | P3 | S |
| **Search** (global) | on | Vault search with operators (`tag:`, `path:`, `[prop]`, `task:`) | partial. `mw.plugins.search.enabled` renders query blocks; global search uses VS Code Search (`search.*`) | map to VS Code search for plain text. A "Search vault" command with Obsidian operators is P2 | P2 | L |
| Search › Copy results: show path, link style, list prefix | — | Copy-results formatting | missing | skip | P3 | — |
| **Canvas** | on | `.canvas` boards (JSON Canvas) | missing | skip (out of editing scope). Maybe a separate custom editor later | P3 | L |
| **Slash commands** | **off** | `/` in the editor opens the command menu | missing | port: `/` menu for formatting and insert commands (headings, callout, table, math, embed, template). Strong Obsidian/Notion feel | P2 | M |
| **Note composer** | on | Merge a note into another; extract the selection to a new note (link/embed/none); template | missing | port **Extract selection to new note** (with `mw.noteComposer.replacementText` = `link`) and Merge (with `askBeforeMerging`=on) | P2 | M |
| **Footnotes view** | **off** | Side pane listing footnotes | partial. `mw.plugins.footnotes.enabled` (inline previews and navigation, no pane) | port a pane later | P3 | S |
| **Bookmarks** | on | Bookmark files, headings, blocks and searches | missing. VS Code has no built-in note bookmarks | port read support for `.obsidian/bookmarks.json` (view + "Bookmark this note") | P3 | M |
| **Properties view** | on | Vault-wide property list with counts and sort | partial. Properties edit inline (`mw.plugins.properties.enabled`); there is no vault view | port: Properties view (reuses the tags view pattern) | P3 | M |
| **Audio recorder** | off | Records audio into the attachment folder | missing | skip | P3 | — |
| **Slides** | off | Presents a note split on `---` | missing | skip | P3 | M |
| **Graph view** | on | Global and local link graph with many display and force options | missing | skip for now (could be a P3 webview later) | P3 | L |
| **Files** (file explorer) | on | Tree, sort, reveal | N/A (VS Code) Explorer | skip | — | — |
| **Format converter**, **Random note**, **Workspaces**, **Publish**, **Sync**, **Web viewer** (off), **Bases** | mixed | Import, random note, layouts, Obsidian services, browser, database views | missing | skip (Bases: maybe someday, as the read-only search plugin does) | P3 | — |
| **Callouts / math / tables / embeds / code blocks / tasks / suggest** (core editing, no Obsidian switches) | always on | — | **have** (each has its own `mw.plugins.*` switch) | keep | — | — |

## 5. Hotkeys

Obsidian keeps user hotkeys in `.obsidian/hotkeys.json` (key `hotkeys` in app config). Defaults in Obsidian include Ctrl/Cmd+O for the quick switcher, Ctrl/Cmd+P for the command palette, Ctrl/Cmd+E to toggle Reading and Editing, Ctrl/Cmd+B/I/K, Ctrl/Cmd+Shift+F for search, Ctrl/Cmd+Enter to toggle a checkbox, Ctrl/Cmd+click to follow a link, and Ctrl/Cmd+Alt+←/→ for back and forward.

| Obsidian option | default | what it does | workbench status | recommendation | priority | effort |
|---|---|---|---|---|---|---|
| Hotkeys pane (customise any command) | — | Rebind any command; filter by conflicts | **N/A (VS Code)** Keyboard Shortcuts (`keybindings.json`). All 65 `markdownWorkbench.*` commands can be rebound | map | — | — |
| Default bindings parity | see above | — | partial. Ctrl+B/I/K and Ctrl+; ship as defaults. Quick switcher, Toggle source mode, Toggle checklist, Set heading and Insert wikilink have **no default key** (the Vim shortcut list consumes Ctrl+O and Ctrl+Alt+0–6 but doesn't bind them) | port Obsidian-style default `when`-scoped bindings (`activeCustomEditorId == 'markdownWorkbench.editor'`): Ctrl/Cmd+O Quick switcher (only inside the editor, or leave it opt-in because it clashes with VS Code's Open File), Ctrl/Cmd+E toggle mode, Ctrl/Cmd+Enter toggle checklist. No Ctrl+P override | **P1** | S |
| Import `.obsidian/hotkeys.json` | — | — | missing | skip (one-off translation script at most) | P3 | M |

---

## 6. Shortlist: top 15 to port

These are in order. Items 1–6 are what an Obsidian user notices in the first hour.

1. **Text font size** (`mw.appearance.fontSize`, falling back to `editor.fontSize` / `[markdown]`), P1 / S. Text is hard-coded at 16px, and changing `editor.fontSize` does nothing, which surprises VS Code users. This is the cheapest win.
2. **Text font family** (`mw.appearance.textFont`), P1 / S. Obsidian users pick a reading font, and the prose now uses the VS Code UI font with no way to change it.
3. **Templates core plugin** (folder + date/time formats + Insert template command), P1 / M. It is one of Obsidian's most-used core plugins and is fully missing. Daily notes and Note composer depend on it.
4. **Daily notes** (date format, folder, template; Open today's daily note command), P1 / M. It is a central Obsidian workflow, and its `.obsidian/daily-notes.json` keys can be read directly.
5. **Obsidian-style default keybindings**, scoped to the workbench editor, P1 / S. Toggle Live Preview/Source (Ctrl/Cmd+E), toggle checklist (Ctrl/Cmd+Enter), Quick switcher (opt-in Ctrl/Cmd+O), and others. Muscle memory matters more than any setting.
6. **Font size quick adjustment commands** (Increase/Decrease/Reset, optional Ctrl+wheel), P2 / S. VS Code zoom scales the whole window, and these let a reader resize only the note.
7. **Status bar Live Preview/Source toggle** (Obsidian's `editor-status`), P2 / S. It makes the mode visible and reuses the existing command.
8. **Slash commands** (`/` insert menu), P2 / M. It speeds up structural edits (callouts, tables, math) without memorising commands. Obsidian ships it off, so our default can be off too.
9. **Note composer: Extract selection to new note / Merge note** (`replacementText`, `askBeforeMerging`), P2 / M. It is a key refactoring tool for notes and builds on link updates and templates.
10. **CSS snippets** (`mw.appearance.cssSnippets`, optionally reading `.obsidian/snippets`), P2 / M. It is the main way Obsidian users tune looks. It needs a stable class contract and a note in the docs that snippet CSS is the user's own.
11. **Backlinks at bottom of note** (`mw.backlinks.inDocument`), P2 / M. Obsidian users who rely on in-document backlinks find a sidebar alone weaker.
12. **Readable line width value** (`mw.editor.readableLineWidth`, px or ch), P2 / S. The user turned the cap off by default, so whoever turns it on should be able to pick the width. 700px is fixed now.
13. **Reading view + "Default view for new tabs"**, P2 / L. Obsidian's Editing/Reading split is the last missing piece of the view model. It's large, so it comes after the cheap items.
14. **File recovery → document and verify VS Code Local History**, P2 / S. This is mostly docs plus one check that custom-editor saves produce Timeline entries. If they don't, the work becomes M.
15. **Quick switcher filters** (show existing only / show attachments / show all file types) + **Rebuild vault index** command, P3 / S. These are small parity items that cost almost nothing.

Next after these: Properties view, Bookmarks (`bookmarks.json`), Footnotes pane, Unique note creator, a "Search vault" command with Obsidian operators, and Graph view.

## 7. Workbench defaults that differ from Obsidian 1.14.4

| Setting | Obsidian default | Workbench default (HEAD `f7105ac`) | Note |
|---|---|---|---|
| Line numbers (`mw.plugins.lineNumbers.enabled`) | off | `false` at HEAD → **`true` per user decision** (already in the other job's working copy) | **User chose differently: keep ON.** |
| Mermaid (`mw.plugins.diagrams.enabled`) | **off** (1.14.4 adds an opt-in toggle in Editor, stored per device) | `true` | **User chose differently: keep ON.** |
| Readable line length (`mw.editor.readableLineLength`) | on | `true` at HEAD → **`false` per user decision** (already in the other job's working copy) | **User chose differently: keep OFF.** |
| Backlinks plugin | on | `false` | An earlier owner decision (PARITY.md). Re-confirm with the user. |
| Outgoing links plugin | on | `false` | An earlier owner decision (PARITY.md). Re-confirm with the user. |
| Show editing-mode status (`editor-status`) | on | n/a (missing) | Ship it ON when ported. |
| Footnotes view / Slash commands | off | n/a | When ported, default OFF to match Obsidian, or ON by choice. |
| Text font / size | system sans, 16px | VS Code UI font, 16px fixed | The size matches but can't be changed. The font differs. |
| Accent colour | Obsidian purple | theme link colour | This is intentional, to follow the VS Code theme. |

All other ported options match Obsidian's defaults: Live Preview, strict line breaks off, properties visible, both folds on, indent guides on, RTL off, both auto-pairs on, smart lists on, tabs with width 4, paste-HTML on, spellcheck on, Vim off, inline title on, shortest links, wikilinks on, link updates prompt, new notes and attachments at the vault root, and no exclusions.
