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
