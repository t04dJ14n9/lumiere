# Tables

Edit Markdown tables as a grid with cell editing, rectangular selections,
row/column operations and clipboard commands, like Obsidian's Live Preview tables.

## How it works

A table widget wires a rendered grid to a cell projection, selection, keyboard,
clipboard and toolbar collaborator. The projection reserializes the entire table
with column-aligned padding on each cell edit, in the existing native input group;
it never owns undo history. The controller reconciles
incoming snapshots, preserving the active cell editor across structural edits.
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
- `webview.ts`: named registrations for rendering, projection and commands.
- `environment.ts`: injected capabilities available to table interactions.
- `content.ts`: asynchronous render-pass ownership and cancellation.
- `widget.ts`: Live Preview widget creation, reuse and disposal.
- `controller.ts`: collaborator wiring and incoming snapshot reconciliation.
- `grid.ts`: source snapshot, rendered cells and whole-table edits.
- `projection.ts`: active cell lifetime and edits into outer source offsets.
- `source-edits.ts`: aligned source edits that preserve unchanged cell anchors.
- `cell-editor.ts`: temporary raw Markdown cell view, input groups and Vim transfer.
- `cell-source.ts`: session whitespace, alignment padding and source-range tracking.
- `selection.ts`: grid selection and projected source selection.
- `selection-drag.ts`: pointer selection, capture and scrolling lifetime.
- `keyboard.ts`: grid shortcuts and movement between cells or out of the table.
- `navigation.ts`: text boundaries, document entry and Vim arrows, counts and g-prefix interpretation.
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
- `webview.test.ts`: persistent widget, entry registrations and insertion unit tests.
- `tables-measured.spec.ts`, `tables-a11y.spec.ts` (browser) and `test/vscode/tables.spec.ts`: interactions measured in Obsidian 1.14.4, accessibility tree and keyboard traversal, and native undo in the real editor.
- `tables-vim.spec.ts` (browser): measured source entry, counts, row hops, operators, visual selection and search.
- `tables-selection-colors.spec.ts` (browser): selected inline code, bold, links and math colors in dark and light themes.
- `tables.css`: grid, handles, selection and cell editor appearance, bundled through
  `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `document`, `markdown`, `livePreview`, `render`, `commands`,
`menu`, `rpc`; optionally `vim`, `formatting` and `links`. The optional Links
service follows Mod-Enter from the focused cell's own document and caret.
Provides no service. Listens to
`editor/clearProjection`, `editor/projectSelection` and `editor/activeView`;
sends the validated editor `selectionChanged` notification. The feature switch
is `markdownWorkbench.plugins.tables.enabled`; it has no separate configuration.

## Limits and differences from Obsidian

Save, undo and redo belong to VS Code's TextDocument. Cell selections map to
Markdown offsets for consumers of the editor selection API. Live Preview always
keeps tables rendered; only the focused cell reveals raw Markdown. Source mode
shows the full table source. HTML conversion is delegated
to the paste pipeline rather than implemented by the table widget.
Selected cells show their selection background through inline code while keeping
its theme foreground and monospace styling; unselected code keeps its background.

HTML paste in a focused cell uses the outer editor capture pipeline; the table
clipboard ignores already-handled events. Rectangular paste keeps TSV semantics.
Menu paste reads plain text through the host. Shift+Enter stores `<br>`, as measured in Obsidian. Rectangular selections and
keyboard menus on grips are additional capabilities. Generic block insertion and
link-creation submenus are outside this cell menu; editor commands still work.

Normal-mode cell `j`/`k` and `gj`/`gk` hop one row at a text boundary, ignoring
counts; `h`/`l`, arrows, Escape and insert mode retain their existing behavior.
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
