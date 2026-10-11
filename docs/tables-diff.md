# Table editing parity

Reference: Obsidian 1.14.4, measured on 2026-10-10 in
`/workspace/plans/obsidian-tables-behaviour.md`, with `tb1-tb4.mjs` and the
table screenshots in `/workspace/obsidian-compare/`. “Ours today” describes
the starting code on `tables-parity`; actions below describe this change.

| Obsidian behaviour | ours today | action (fix / reject+why / defer+why) |
| --- | --- | --- |
| Table stays a widget in Live Preview, even with the caret in its source range. | Normally a widget, but “Edit table source” reveals the whole table. | Fix: remove that action and its disclosure state; Source mode remains the way to edit the full Markdown. |
| Focus gives the table `has-focus`. | Uses `:focus-within`; an editor can survive keyboard focus leaving the table. | Fix: track table focus and close the cell projection when focus leaves. |
| Clicking a cell puts the caret at the clicked text. | Already maps rendered text to source offsets and opens a cell editor. | Fix: keep and pin with a focused-cell interaction test. |
| Only the focused cell shows all its raw inline Markdown. | Other cells render, but the focused cell still hides syntax away from its caret. | Fix: use raw Markdown in the cell editor throughout its session; restore rendering on exit. |
| Header column grips and first-column row grips live alongside cell content. | Two floating grips track the hovered/active cell. | Fix: attach grips to each header/first-column cell, with a content wrapper that survives rendering. |
| Alignment attributes follow the delimiter row. | Applies `text-align`, without `align` attributes. | Fix: set both on every cell, including active-cell refresh. |
| Tab advances, wraps to the next row, and appends at the last cell. | Already matches. | Fix: preserve and pin routing and append results with units. |
| Shift+Tab moves back, wrapping to the previous row's last cell. | Already matches; leaves above the header. | Fix: preserve and pin with units. |
| Enter moves down in the same column and appends on the last row. | Already matches. | Fix: preserve and pin with units. |
| ArrowDown on the last row leaves without appending a table row. | Already leaves at a visual boundary; creates separated prose space at EOF. | Fix: preserve and pin boundary routing and EOF separation with units. |
| ArrowUp from immediately below returns to the last row. | The outer editor skips widget blocks. | Fix: register table entry before ordinary block navigation, retaining the exit column. |
| Left/Right cross cells only at cell edges. | Already checks text/visual boundaries, including RTL and Vim. | Fix: preserve and pin boundary routing with units. |
| Every cell edit rewrites the whole table with aligned widths and expanded delimiters. | Cell typing edits only the cell range; structural edits normalize the table. | Fix: serialize on every cell change in its existing native input group; apply content/padding edits separately to preserve surrounding text, cell selection and anchors in unchanged cells. |
| Padding follows left/center/right alignment; empty rows have the same widths. | Always pads to the right; minimum delimiter width is already three. | Fix: align padding and keep the existing minimum and colon semantics, with exact-source units. |
| Typing a pipe stores an escaped pipe; a backslash remains a backslash. | Already encodes pipes idempotently and retains backslashes. | Fix: pin typing, repeated normalization, code spans and backslash runs with units. |
| Cell context menu has Row: add above/below, move up/down, duplicate, delete. | Already implemented, omitting impossible boundary moves. | Fix: include disabled boundary moves so the menu consistently lists all operations; pin operations and focus targets. |
| Cell context menu has Column: add left/right, move left/right, three alignments, duplicate, delete. | Already implemented, omitting impossible boundary moves. | Fix: include disabled boundary moves; pin operations, alignments and focus targets. |
| Sort by column A to Z / Z to A. | Already sorts body rows, keeping the header and alignments. | Fix: preserve and pin both directions, stable ties and numeric text. Locale/case ordering was not measured. |
| Cut, Copy, Paste, Paste as plain text, Select all. | First three exist; menu paste already reads plain text through the host. | Fix: add explicit plain-text paste and cell/grid Select all; pin callbacks and stale-paste protection. |
| Format submenu. | Inline formatting works through injected formatting service. | Fix: preserve and pin; disable it when that service is unavailable. |
| Add link / Add external link in the generic editor menu. | Global Insert Link targets the active cell; no generic link submenu. | Defer: duplicating link creation policy in the table menu needs a shared editor-menu contribution; Insert Link remains available. |
| Generic Paragraph and Insert menus. | Not in the table menu. | Reject: block-level paragraph/headings/list insertion is incompatible with a single Markdown table cell; inline formatting remains available. |
| Drag grips reorder rows/columns; plain click does not open a menu. | Already reorders and plain click selects an axis without opening a menu. | Fix: preserve and pin drag/drop plus row/column model results; keep keyboard/context-menu actions on grips for accessibility. |
| Add row button: a 16px bordered strip directly under the table (its full width) with a centred +; add column button: a 16px strip directly beside it (its full height). Both are `opacity: 0` and show only while the pointer is over the strip itself (a table hover or focus does not show them on desktop; `has-focus` shows them only on mobile). Measured: `docs/obsidian-measurements/tables/button-visibility*.mjs`. | Add row showed only while the table had focus (and its strip could not be hovered), so it was missing in the common case; add column showed on table hover, in a 22px gap-separated cell. | Fixed: same strips, size, position and hover rule as Obsidian, also shown for keyboard focus (ours are real buttons, Tab-reachable, unlike Obsidian's unfocusable divs). `tables-add-buttons.spec.ts` and the real VS Code spec in `tables.spec.ts` (screenshots `docs/screenshots/tables-add-row-vscode.png`, `tables-add-column-vscode.png`). |
| Clicking add buttons was not verified by the first probe. | Both append and focus the new row/column; the column button kept the caret's row. | Fix: measured later (`docs/obsidian-measurements/tables/`): both buttons append an aligned empty row/column; the row button focuses its first cell and the column button the new **header** cell. Ours now matches, with `tables-measured.spec.ts`. |
| Shift+Enter storing `<br>` was not verified by the first probe. | Inserts `<br>`; pasted line breaks are normalized similarly. | Fix: measured later (`1<br>x`, caret stays in the cell); pinned in `tables-measured.spec.ts`. |
| Exact private Obsidian DOM names, theme metrics and grip-click selection semantics. | Independent DOM and VS Code theme. | Reject: private identifiers and pixel values are not editing behavior; use independent styles and semantic accessible controls. Grip-click selection was measured later: it selects the axis and opens no menu; ours does the same. |
| Our rectangular selection/drag, TSV paste, clear-cells action and keyboard grip menus. | Extra features beyond the measured spec. | Fix: retain because they do not conflict with normal cell navigation or the cell context menu; remove only whole-table disclosure. |
| With line numbers on, a table shows one number (its first source line) at its top; hidden lines have none; the next number starts right under the widget. | Stacked every hidden line's number beside the table with a fixed spacing: the numbers did not line up with the rows, one sat above the table, and a gap followed it. | Fixed: one number per rendered block, level with the header row for tables (`tables-line-numbers.spec.ts`, real VS Code spec). VS Code's text editor numbers every source line; that is the deliberate difference. |

The kernel and host authority remain unchanged. No source code, CSS or assets
from Obsidian are used. The pinned `~/Code/human-learning` checkout is absent in
this environment; the existing port and its unit tests are available locally.

Regression evidence: the exact alignment tests in `model.test.ts`, alignment
padding tracking in `table.test.ts`, axis/menu and selection-clear tests in `interactions.test.ts`,
Select all in `clipboard.test.ts` and widget/entry registration in
`webview.test.ts` fail against an archive of the starting HEAD. The aligned-typing
assertion was also run before changing the projection helper and failed because
other rows remained unaligned. Baseline checks for pipes, backslashes, navigation,
row/column operations and sort preserve behavior that already worked. The new
unchanged-cell anchor check guards the aligned rewrite itself.

## Claim and evidence

"Parity with Obsidian 1.14" means: every behaviour in the table above was
**measured in a real Obsidian 1.14.4** (scripts and raw output in
`docs/obsidian-measurements/tables/`; first pass in the plan file
`obsidian-tables-behaviour.md`) and is reproduced by a test that runs in a real
Chromium (`test/browser/tables-measured.spec.ts`, `tables-parity.spec.ts`,
`tables-a11y.spec.ts`) or in the real VS Code (`test/vscode/tables.spec.ts`).

Deliberate differences, all measured:

- Obsidian rewrites the table aligned as soon as a cell is *clicked*, as an
  undo step of its own, so a click modifies the note. We align on the first
  edit, inside that edit's undo step; a click never dirties a note.
- Undoing a structural change in Obsidian drops the focus. We keep the caret in
  the nearest remaining cell, so the next undo still works.
- No generic Paragraph/Insert/Add link submenus (see the rows above).

Open acceptance issue, general to the workbench: the earlier real-VS Code run
observed that typing `abc`, moving the caret and typing `X` could undo together.
That observation was attributed to native WorkspaceEdit coalescing, but did not
isolate its cause. `test/vscode/tables.spec.ts` only checks whole-table integrity
and eventual restoration; it does not prove the required step granularity.

Follow-up code inspection found that handled undo/redo shortcuts also reached
VS Code's webview key-forwarding listener, which can trigger a second native
action. The new `commands/history-keys.ts` guard stops only handled history
chords before that listener, including projected cells and non-Latin keyboard
fallbacks. Its pure predicate/disposal units pass; a native before/after probe
and the full local checks are still required before calling this fixed. The
one-logical-edit undo expectations in `MANUAL_TEST_PLAN.md` remain acceptance
requirements, not a claim that the current native suite has verified them.

Not measured in Obsidian, so not claimed: real IME software (only synthetic
composition through the DevTools protocol), touch/pen input, drag autoscroll at
the viewport edge, screen readers, pixel metrics. See
`docs/obsidian-measurements/tables/README.md`.

Regression coverage for the whole-table rewrite (B9-2): the rewrite is applied
as per-cell edits that leave unchanged cells' text, and so every anchor inside
them, untouched (`source-edits.ts`). Tests: 20 edits across cells then undone one
step at a time (each undo lands on a state already seen), an external edit to
another cell while a cell is focused, IME composition, and CJK/emoji/combining/
ZWJ cells, in `tables-measured.spec.ts`; the same sequences against real
VS Code native undo in `test/vscode/tables.spec.ts`.
