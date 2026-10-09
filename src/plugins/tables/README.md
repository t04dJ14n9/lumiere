# Tables

Edit Markdown tables as a grid with cell editing, rectangular selections,
row/column operations and clipboard commands, like Obsidian's Live Preview tables.

## How it works

A table widget wires a rendered grid to a cell projection, selection, keyboard,
clipboard and toolbar collaborator. The projection reserializes the entire table
with column-aligned padding on each cell edit, in the existing native input group;
it never owns undo history. The controller reconciles
incoming snapshots, preserving the active cell editor across structural edits.
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
- `navigation.ts`: text boundaries, document entry and Vim arrow-key interpretation.
- `clipboard.ts`: text/grid copy, paste and formatting, including stale-paste checks.
- `toolbar.ts`: add-row/column controls and contextual menu lifetime.
- `menu.ts`: menu items and their operation/focus targets.
- `handles.ts`: row/column grips, drag feedback and drop handling.
- `hit-test.ts`: cell and axis hit testing.
- `commands.ts`: command IDs to table operations.
- `state.ts`: active-table registry and selection/action facets.
- `interactions.test.ts`: source projection, navigation, selection and menu unit tests.
- `table.test.ts`: cell-source and operation unit tests.
- `model.test.ts`: exact aligned source and pipe escaping unit tests.
- `operations.test.ts`: row/column and sort unit tests.
- `navigation.test.ts`: keyboard routing, append, exit and re-entry unit tests.
- `clipboard.test.ts`: cell/grid clipboard, selection and stale-paste unit tests.
- `webview.test.ts`: persistent widget, entry registrations and insertion unit tests.
- `tables.css`: grid, handles, selection and cell editor appearance, bundled through
  `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `document`, `markdown`, `livePreview`, `render`, `commands`,
`menu`, `rpc`; optionally `vim` and `formatting`. Provides no service. Listens to
`editor/clearProjection`, `editor/projectSelection` and `editor/activeView`;
sends the validated editor `selectionChanged` notification. The feature switch
is `markdownWorkbench.plugins.tables.enabled`; it has no separate configuration.

## Limits and differences from Obsidian

Save, undo and redo belong to VS Code's TextDocument. Cell selections map to
Markdown offsets for consumers of the editor selection API. Live Preview always
keeps tables rendered; only the focused cell reveals raw Markdown. Source mode
shows the full table source. HTML conversion is delegated
to the paste pipeline rather than implemented by the table widget.

HTML paste in a focused cell uses the outer editor capture pipeline; the table
clipboard ignores already-handled events. Rectangular paste keeps TSV semantics.
Menu paste reads plain text through the host. Shift+Enter retains the existing
`<br>` encoding; its Obsidian parity is not verified. Rectangular selections and
keyboard menus on grips are additional capabilities. Generic block insertion and
link-creation submenus are outside this cell menu; editor commands still work.
