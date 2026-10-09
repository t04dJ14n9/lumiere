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
| Add row button sits below, visible when focused; add column button sits beside, visible on hover. | Both are text toolbar actions below, visible on either hover or focus. | Fix: place labelled + buttons on the respective edges, with the measured visibility rules and keyboard focus support. |
| Clicking add buttons was not verified by the probe. | Both already append and focus the new row/column. | Fix: retain the requested append behavior and test our buttons; defer the claim of measured Obsidian click parity. |
| Shift+Enter storing `<br>` was not verified. | Already inserts `<br>`; pasted line breaks are normalized similarly. | Defer: retain and unit-test the existing safe single-line encoding; do not claim a new empirical observation. |
| Exact private Obsidian DOM names, theme metrics and grip-click selection semantics. | Independent DOM and VS Code theme. | Reject: private identifiers and pixel values are not editing behavior; use independent styles and semantic accessible controls. Grip-click selection was not measured. |
| Our rectangular selection/drag, TSV paste, clear-cells action and keyboard grip menus. | Extra features beyond the measured spec. | Fix: retain because they do not conflict with normal cell navigation or the cell context menu; remove only whole-table disclosure. |

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

Verification: Prettier, lint, typecheck and build pass; **82/82** table, ported
table, lint-rule and plugin lifecycle/composition units pass. Checks were run
separately. The normal `pnpm exec tsx --test` launcher cannot bind
its IPC socket in this sandbox (`EPERM`); Node's `tsx` import hook runs the same
unit files. The existing three layer test wrappers cannot spawn their compiler
subprocess (`spawnSync EPERM`); direct compilation of their negative DOM/Node/
VS Code fixtures rejects the platform APIs as expected. The kernel is unchanged
at 815 TypeScript lines.

The sole targeted browser spec, `test/browser/tables-parity.spec.ts`, cannot
execute here: Chromium aborts at startup with `sandbox_host_linux.cc`,
`shutdown: Operation not permitted`. DOM focus/raw reveal, grip placement,
hover, button clicks, menu focus transfer and pointer dragging therefore remain
unverified in a running browser. No VS Code, Cursor or Obsidian was launched.
The manual plan covers IME, drag/scroll, native undo and two-panel edits; the
owner should run these against the disposable fixture vault. Shift+Enter and
Obsidian add-button click parity remain unmeasured reference behavior.
