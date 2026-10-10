# Tables: interactions measured in Obsidian 1.14.4

These probes drive a real Obsidian 1.14.4 (Electron, started with
`--remote-debugging-port=9333`, `--no-sandbox --disable-gpu` on a visible X
display) with real mouse and keyboard events through the DevTools protocol.
They use the disposable vault `/tmp/obsidian-test-vault`; nothing here reads a
user's notes. Run one with `node <script>.mjs` from this directory (it needs
`@playwright/test`, which the repository already has). Raw output of the last
run is in `results.md`.

The first measurements (`/workspace/plans/obsidian-tables-behaviour.md`, scripts
`tb1`–`tb4`) covered the widget, navigation, aligned rewrites, pipes and menus.
These scripts close the gaps that the first pass listed as "not verified".

| Interaction | Measured in Obsidian 1.14.4 | Ours | Test |
| --- | --- | --- | --- |
| Add-row button (real click) | Appends `\|     \|     \|     \|` below the last row, caret in its first cell. The first pass reported that a click did not add a row; `page.click`, a mouse down/up and a dispatched click all do, from a freshly reset note. | Same source and focus. | `test/browser/tables-measured.spec.ts` |
| Add-column button (real click) | Appends an empty header cell with a left-aligned `---` delimiter and an empty cell per row; **caret goes to the new header cell**, whichever row it was in. | Same source. **Was different** (caret stayed in its row); fixed here. | same |
| Shift+Enter in a cell | Stores `1<br>x`; caret stays in the cell, which renders two lines until it loses focus. | Same source and focus. | same |
| Drag a row grip | Real pointer drag reorders the rows; the moved row's cell keeps focus. | Same source. | same |
| Drag a column grip | Reorders columns with their alignment markers and body cells. | Same source. | same |
| Click a grip | Selects that column/row (`is-selected` on its cells) and opens **no** menu. | Same. | same |
| Native undo, typing | Typing is one undo step; a Tab to the next cell starts a new one. Undo never leaves a half-written table. | Same steps. | same |
| Native undo of alignment | Obsidian **rewrites the table aligned as soon as a cell is clicked**, even with no edit, and that rewrite is its own undo step (the note becomes modified by a click). | **Deliberately different**: we align with the first edit, in that edit's undo step, so a click never dirties the note and one undo restores the original source. | same, and `tables.spec.ts` in real VS Code |
| Undo of a structural change | Undoing "add row" drops the focus (it lands on `body`). | We keep the caret in the nearest remaining cell, so the next Ctrl+Z still works (fixed here; the old code lost focus after undoing a removed row). | `20 edits across cells…` |
| Width of CJK, emoji, combining marks, ZWJ sequences | Padding counts UTF-16 code units: `中文` and `😀` are width 2, `é` (e + U+0301) 2, a family emoji sequence 8. | Same (unit test). | `model.test.ts`, `tables-measured.spec.ts` |
| IME composition | The composition text is written into the source while composing (`4n`, `4ni`), then the committed text replaces it (`4你`). | Same. | `IME composition…` |

## Not measured (and why)

- Real IME software (only synthetic `Input.imeSetComposition`).
- Touch and pen pointers, and trackpad inertia scrolling during a drag.
- Drag autoscroll near the viewport edge in Obsidian (our edge scrolling is unit tested only).
- Screen-reader announcements: Obsidian's table has no ARIA roles beyond the
  native `table`; ours are asserted against Chromium's accessibility tree in
  `test/browser/tables-a11y.spec.ts`, but no screen reader was run.
- Exact pixel metrics: independent theme, by design.

## Add-row / add-column button visibility

`button-visibility.mjs` and `button-visibility2.mjs` (Obsidian 1.14.4, desktop): the buttons are `div.table-row-btn` /
`div.table-col-btn` (`tabindex -1`, not keyboard reachable). Row: `dx 0, dy = table height, 166 x 16` (full table width);
column: `dx = table width, dy 0, 16 x 90` (full height). `opacity: 0` with `transition: opacity .1s`, and only
`:hover` on the button itself sets `opacity: 1`; table hover and `has-focus` change nothing on desktop (`has-focus` shows
them on mobile only). Ours matches this and adds keyboard-focus visibility.

## Line numbers beside a rendered table

`line-numbers.mjs` and `line-numbers-blocks.mjs` (Obsidian 1.14.4, "Show line number" on). A table on source
lines 3-6 gets a single gutter cell, `3`, as tall as the widget and starting at its top; the next number is `7`, starting
exactly where the widget ends (no gap, no numbers for 4-6, the same with the caret in the table). Callouts and math blocks
behave the same (`8` then `11`; `12` then `15`). Properties (frontmatter) get no number at all, and the first
number is `6`. Ours: one number per rendered block at its top, lowered to the header row for tables; a properties
block shows `1` (not measured as a deliberate difference). Spec: `test/browser/tables-line-numbers.spec.ts`, real
VS Code in `test/vscode/tables.spec.ts`.

`line-numbers-simple.mjs` / `-results.md` run the real `02-tables.md` through Obsidian: the blank source line before a
table keeps its own number on its own 24px row (`8` heading, `9` blank, `10` table, `15` the blank after it), the table
follows directly with no extra margin, and `line-numbers-centre.mjs` shows the table's number centred on its header row
(498.4 vs 497.3px). Ours gives the same sequence and the same row structure (blank 24px rows around the table).
