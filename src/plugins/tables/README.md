# Tables

Edit Markdown tables as a grid with cell editing, rectangular selections,
row/column operations and clipboard commands, like Obsidian's Live Preview tables.

## How it works

A table widget wires a rendered grid to a cell projection, selection, keyboard,
clipboard and toolbar collaborator. The projection reserializes the entire table
with column-aligned padding on each cell edit, in the existing native input group;
it never owns undo history. The controller reconciles
incoming snapshots, preserving the active cell editor across structural edits.
Vertical wheel input over the widget is forwarded to the note scroller using
the browser's smooth animation from the first tick. All tables in one panel
share a pending destination so rapid ticks retain their full distance. Other
input or navigation cancels that motion, and reduced-motion preferences use
immediate scrolling. Horizontal and Shift-wheel gestures stay with the table's
overflow box. The selection and focus stay in place during scrolling.
Grid Ctrl+C/Cmd+C snapshots the selected rectangle as TSV and writes through
Editor's validated host clipboard service, preserving grid focus and selection.
Native copy events and menu commands use the same TSV serialization; ordinary
cell-text selection remains with CodeMirror.
With Vim enabled, collapsed normal-mode outer source landings open the owning
cell at its mapped offset after the outer update. Entry rejects stale work,
pointer selections, document edits, pending/visual/insert modes and projection
transactions. The delimiter line maps to the last row's first cell, as measured.
Padding and internal trailing pipes belong to the preceding cell; the leading
and final pipes fall back to the first cell at offset zero.
Render passes are cancelled before a cell editor takes over their DOM. All
plugin registrations and widget lifetimes end when the plugin stops.

## Files

- `manifest.ts`: settings identity and table command contributions.
- `webview.ts`: named registrations for rendering, wheel motion, projection and commands.
- `environment.ts`: injected capabilities available to table interactions.
- `content.ts`: asynchronous render-pass ownership and cancellation.
- `widget.ts`: Live Preview widget creation, reuse and disposal.
- `controller.ts`: collaborator wiring and incoming snapshot reconciliation.
- `grid.ts`: source snapshot, rendered cells and whole-table edits.
- `projection.ts`: active cell lifetime and edits into outer source offsets.
- `source-edits.ts`: aligned source edits that preserve unchanged cell anchors.
- `cell-editor.ts`: temporary raw Markdown cell view, input groups and Vim transfer.
- `cell-source.ts`: session whitespace, alignment padding and source-range tracking.
- `selection.ts`: grid selection, active-cell chrome and projected source selection.
- `selection-chrome.test.ts`: selected-cell matrix and inset selection-box CSS unit tests.
- `selection-drag.ts`: pointer selection, capture and scrolling lifetime.
- `wheel-scroll.ts`: vertical wheel routing, gesture guards and delta units.
- `wheel-scroll.test.ts`: wheel directions, units, horizontal gestures and note limits.
- `wheel-motion.ts`: per-panel smooth wheel destinations, reversal and cancellation.
- `wheel-motion.test.ts`: first ticks, accumulated distance, interruption, boundaries and reduced motion.
- `keyboard.ts`: grid shortcuts and movement between cells or out of the table.
- `navigation.ts`: text boundaries, document entry and Vim arrows, counts and g-prefix interpretation.
- `word-motion.ts`: Unicode word endpoints and counted navigation in table row order.
- `word-navigation.ts`: per-editor resolved normal-word and document-line routing through Vim mappings and recording.
- `word-motion.test.ts`, `word-navigation.test.ts`: Unicode, direction-preserving edges, counts, mode guards, mappings and macro replay.
- `vim-entry.ts`: deferred normal-mode source entry with transaction and mode guards.
- `clipboard.ts`: text/grid copy, paste and formatting, including stale-paste checks.
- `toolbar.ts`: add-row/column controls and contextual menu lifetime.
- `menu.ts`: menu items and their operation/focus targets.
- `handles.ts`: row/column grips, drag feedback and drop handling.
- `hit-test.ts`: cell and axis hit testing.
- `commands.ts`: command IDs to table operations.
- `state.ts`: active-table registry, projection annotation and selection/action facets.
- `interactions.test.ts`: source projection, navigation, selection and menu unit tests.
- `table.test.ts`: cell-source and operation unit tests.
- `model.test.ts`: exact aligned source and pipe escaping unit tests.
- `operations.test.ts`: row/column and sort unit tests.
- `navigation.test.ts`: keyboard routing, append, exit and re-entry unit tests.
- `vim-source.test.ts`: source-column ownership, delimiter entry, transaction/mode guards and deferred-entry cancellation unit tests.
- `src/markdown/tables/model.ts`: pure table parsing, serialization and source-position mapping.
- `clipboard.test.ts`: cell/grid clipboard, selection and stale-paste unit tests.
- `webview.test.ts`: persistent widget, entry, insertion and wheel lifetime unit tests.
- `tables-copy.spec.ts` (browser): handle, row, rectangle and single-cell TSV shortcuts.
- `tables-scroll.spec.ts` (browser): selected-row wheel scrolling on both axes, with and without Vim.
- `tables-measured.spec.ts`, `tables-a11y.spec.ts` (browser) and `test/vscode/tables.spec.ts`: interactions measured in Obsidian 1.14.4, accessibility tree and keyboard traversal, and native undo in the real editor.
- `tables-vim.spec.ts` (browser): measured source entry, counts, row hops, operators, visual selection, search and Unicode word movement across cells.
- `tables-selection-colors.spec.ts` (browser): selected inline code, bold, links and math colors in dark and light themes.
- `tables-selection-chrome.spec.ts` (browser): active-cell and row-handle selection box visibility.
- `tables.css`: grid, handles, selection and cell editor appearance, bundled through
  `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `document`, `markdown`, `livePreview`, `render`, `commands`,
`menu`, `rpc`; optionally `vim`, `formatting` and `links`. The optional Links
service follows Mod-Enter from the focused cell's own document and caret.
Provides no service. Listens to
`editor/clearProjection`, `editor/projectSelection` and `editor/activeView`;
sends the validated editor `selectionChanged` notification. The feature switch
is `markdownWorkshop.plugins.tables.enabled`; it has no separate configuration.

## Limits and differences from Obsidian

Save, undo and redo belong to VS Code's TextDocument. Cell selections map to
Markdown offsets for consumers of the editor selection API. Live Preview always
keeps tables rendered; only the focused cell reveals raw Markdown. Source mode
shows the full table source. HTML conversion is delegated
to the paste pipeline rather than implemented by the table widget.
Selected cells show their selection background through inline code while keeping
its theme foreground and monospace styling; unselected code keeps its background.
The open cell editor and rectangular grid selections share the same inset accent
selection box; `.table-scroll` overflow would clip a CSS outline.

HTML paste in a focused cell uses the outer editor capture pipeline; the table
clipboard ignores already-handled events. Rectangular paste keeps TSV semantics.
Copy currently publishes plain TSV; HTML and Markdown clipboard flavors are not provided.
Menu paste reads plain text through the host. Shift+Enter stores `<br>`, as measured in Obsidian. Rectangular selections and
keyboard menus on grips are additional capabilities. Generic block insertion and
link-creation submenus are outside this cell menu; editor commands still work.

Normal-mode cell `j`/`k` and `gj`/`gk` hop one row at a text boundary, ignoring
counts; `h`/`l`, arrows, Escape and insert mode retain their existing behavior.
Normal-mode `w`/`W`, `e`/`E`, `b`/`B` and `ge`/`gE` move through words in
row order, wrapping between rows and skipping cells without words. Counts span
cells. Small words use the Vim adapter’s Unicode letter/number classification
(including contiguous CJK); WORDs group all non-whitespace punctuation.
Grapheme endpoints keep surrogate pairs and combining characters whole.
Table edges clamp in the requested direction without adding rows or prose.
Vim resolves mappings and records the original keys before table routing replaces
its normal word landing. Word crossings move the same cell editor to the next
cell so a running mapping or macro continues against that cell's text.
Normal `gg`/`G` and their counted forms close the cell editor and move the outer
caret to the requested source line, clamped to the document. A table-source
destination stays in the outer editor rather than reopening a cell. The buffer
handoff is synchronous so remaining mapped or replayed commands act on the note;
only the old cell editor and adapter teardown waits until Vim finishes the motion.
Deferred outer-source entry requires one collapsed caret, focused content and
settled normal mode. Selection/document changes, blur, mode transitions and
disposal cancel pending entry. For Vim navigation entry only, every delimiter
column opens the last row's first cell at offset zero (the header for a
header-only table); this is an explicit compatibility rule, independent of
ordinary source motion and operator endpoints.

Not matched on purpose: Obsidian hops and abandons operators or visual mode
inside a cell. We keep the dependency's buffer behavior. Leaving a table at EOF
or the start of a note keeps a blank separator, so typed prose cannot be absorbed
into the table. Non-Vim table navigation remains unchanged.
