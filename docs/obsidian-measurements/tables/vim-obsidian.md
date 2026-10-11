# Vim and tables in Obsidian 1.14.4 (measured and read from source)

Measured 2026-10-12 with the real Obsidian 1.14.4 AppImage on the visible display, Live Preview, Vim key
bindings on, line numbers on, in a disposable vault (`vim-start-obsidian.sh`, `vim-lib.mjs`, `vim-probe.mjs`,
`vim-cases.json`). Keys are real trusted key events (`Input.dispatchKeyEvent`). Raw per-key output of every
case: `vim-results-raw.md`; screenshots: `vim-shots/` (names are `<case>-<step>.png`).
Source reading (read-only, behaviour understanding only; nothing copied): the shipped `app.js` of the same
version, formatted locally and looked at with `rea` (see "Provenance"). Each finding below is tagged
**[screen]** (measured on screen), **[source]** (confirmed by reading the shipped code) or both.

Fixture: `prose above one here / prose above two / (blank) / | alpha | beta  | / | ----- | ----- | /
| gamma | delta | / | eps   | zeta  | / (blank) / prose below one here / prose below two`. Source lines are
0-based in the logs (`src=3:2` is line 3, column 2). `head=N` is the caret offset inside the cell; in normal
mode `head` equal to the cell length means "after the last character" (Obsidian leaves the caret there when
it arrives from the right side or from a source column past the text).

## How Obsidian is built (explains most results) [source]

* Every table cell is its **own CodeMirror editor** (with its own Vim state). The focused cell is a normal
  Vim buffer containing only that cell's text.
* The outer editor does **not** special-case Vim for tables. Vim's `j`/`k` is plain source-line arithmetic
  (`line ± count`, goal column = Vim's remembered column). When the caret lands on a source line inside a
  table, the table widget **focuses the cell** that owns that source position. That is why counts and
  visual/operator motions walk the table's source lines.
* The cell editor installs a hook (`getNextTablePos`) into its Vim adapter, only when Vim is on. When a
  vertical (`line`) or horizontal (`char`) Vim motion would leave the cell's text, the hook cancels the motion
  and, ten milliseconds later, moves to the cell above (caret placed on the cell's last line), below (caret at
  the cell start), the previous or next cell (caret at its end or start), or around the table (before/after).
  Counts are ignored by this hop: one row or cell per key press.

## Entering a table from prose [screen]

| Action (caret in normal mode) | Result |
| --- | --- |
| `j` from the blank line above the table | Header cell opens, still normal mode. The cell and the offset come from Vim's remembered **source column** (below). Goal column 0 → `alpha`, offset 0. |
| `k` from the blank line below the table | Last row cell opens, same column mapping. |
| `gj` / `gk` | Identical to `j` / `k`. |
| `j`, `k` then continue | Rows follow top to bottom, one row per key. The column is kept; the **offset resets to 0** (entering from above) or 0 for single-line cells (entering from below). The remembered Vim column is not carried into cells. |
| Prose directly above the blank line, goal column kept | `j` from the line above the blank first lands on the blank line (column 0), then enters the table with the **same goal column** as before the blank line. |

Source column → cell map (header line `| alpha | beta  |`, offsets in `head`):
column 0 → alpha 0; 1 → alpha 0 (padding); 3 → alpha 1; 6 → alpha 4; 7 (padding) → alpha 5 (end);
8 (the pipe) → alpha 5 (end); 9 (padding after the pipe) → beta 0; 10 → beta 0; 12 → beta 2;
14, 15 (padding/end) → beta 4 (end); 16 (the final pipe) → **first cell, offset 0**. Same map on the last row.
In words: a cell owns the source from the character after its leading pipe up to and including its trailing
pipe; the offset is the column minus the cell text start, clamped to the text. The final pipe and anything past
it fall back to the first cell.

## Counts, operators and visual mode around a table [screen]

* A count larger than one from outside is plain source-line arithmetic. `5j` from line 0 lands on line 5 col 3
  → `gamma` offset 1. `2k` from line 8 (col 3) lands on line 6 → `eps` offset 1.
* A count whose target is the **delimiter line** (line 4) lands in the **last row's first cell, offset 0**
  (`3j` from line 1, `2j` from line 2, `4k` from line 8; goal column 3 or 14 does not matter).
* A count **inside a cell** is ignored by the hop: `2j`, `3k`, `9j`, `9k` move exactly one row.
* Operators take plain source lines: `d2j` from line 1 deletes lines 1-3 (the header row included);
  `dj` from the blank line above deletes the blank line and the header row; `dk` from the blank line below
  deletes the last row and the blank line. (Obsidian re-adds a separating blank line after `dj` from line 1,
  which this note does not reproduce: see "Not matched on purpose".) `cj` from the blank line behaves the same
  as `dj` and then enters insert mode on the surviving line.
* Visual `v`, `V` and `Ctrl-v` that start in prose and press `j` (or start below and press `k`) extend one
  **source line per key press through the table, the delimiter line included**; the caret never enters a
  cell and the mode stays visual. `}` and `{` treat the whole table as one paragraph (blank line above →
  blank line below) and never enter a cell. `G`, `gg` are ordinary.
* `/delta` + Enter from prose focuses the cell that contains the match (`delta`, offset 0).

## Moves between rows and cells inside a table [screen + source]

| Key (cell in normal mode) | Result |
| --- | --- |
| `j` / `k` | Next/previous row, same column, cell offset 0 (placed on the cell's last line when moving up into a multi-line cell). |
| `l` at the last character of a cell | Next cell, offset 0. At the end of a row: first cell of the next row. At the end of the last cell of the table: caret goes to the line after the table (outside, normal mode). |
| `h` at offset 0 | Previous cell, caret after its last character (offset = length, one step past the last character), the next `h` moves normally. At the start of a row: last cell of the previous row. At the first cell: out of the table to the line before it (column 0). |
| `$`, `0`, `^`, `w`, `b` | Stay inside the cell (`w` and `b` do not cross cells). |
| `Tab` | In normal mode: next cell **with its whole text selected in visual mode**. In insert mode: next cell, caret at its end. `Shift+Tab` mirrors it. `Enter` in the last row (either mode) adds a row and moves into it. |
| `j` on the last row / `k` on the header | Leave the table to the next/previous source line, column 0, outside, normal mode. Then `k`/`j` re-enters at the neighbour row. |
| At the end of the document / start of the document | Leaving after the last row adds one line break at the end of the note and puts the caret on the new empty line; leaving upward from a table that starts the note inserts one empty line before it. |

## Insert mode in a cell [screen]

* `i a A I s S cc` behave as in prose within the cell text. The first typed character rewrites the whole table
  aligned (one undo step with that edit).
* `o` / `O` insert a line break inside the cell (stored as `<br>` in the source, the cell shows two lines),
  not a new row; `p` after `yy` pastes the line the same way.
* `Escape` in insert mode: normal mode in the same cell, caret one character left (usual Vim). `Escape` in
  normal or visual mode never leaves the cell (visual `Escape` returns to normal, caret one left).
* Insert mode `j`/`k` are text. `ArrowDown`/`ArrowUp` in insert mode move between rows (and out of the table
  below the last row; `ArrowUp` from below re-enters the last row) keeping insert mode. `ArrowRight`/`ArrowLeft`
  cross cell borders at the text ends, like normal-mode `l`/`h`.
* `x`, `dd`, `r`, `u`, `.`, `:w` work as in any Vim buffer inside the cell. `dd` clears the cell's text
  (the table keeps its rows). `.` repeats in the cell that has focus.

## Not matched on purpose (Obsidian quirks of the hop hook)

These happen because the hop fires on any vertical/horizontal step that leaves the cell, including with a
pending operator or in visual mode; matching them would drop the pending Vim state:

* `vj` / `Vj` / `vk` inside a cell: visual mode ends and the caret hops to the next/previous cell.
* `dj` inside a cell clears the cell (linewise delete of its only line) **and** hops to the next row.
* Normal-mode `Tab` selecting the whole next cell in visual mode.
* `dj` from the line above the blank separator: Obsidian re-adds a blank line between the prose and the table.
* `Ctrl-d` (observed to remove a prose line): unrelated to tables, not investigated.
* EOF/start-of-note exit: ours keeps a blank separator before new prose so typing cannot become another
  table row. The measured single-line-break EOF exit and one-blank-line start-of-note exit are not matched.

## Our editor after this change (regressions in `tables-vim.spec.ts`)

The earlier probe reported 45 of 78 cases differing. The implementation now corrects outer table
overshoots to source-line arithmetic for single/count/display-line motions, operators and visual mode.
Normal-mode source landings open the owning cell, including search and the delimiter-line quirk; counted
and g-prefixed normal-mode hops inside cells move one row. Unit regressions cover source-column mapping,
the overshoot decision and navigation routing. `tables-vim.spec.ts` covers A/B/G/H/I/J/K/L behaviour,
including header/last-row goal columns, delimiter entry, deletes, visual traversal and search focus.

Browser execution and a fresh `vim-compare.py` result are pending the parent's run: Chromium cannot
launch in the implementation sandbox. The raw log in this checkout ends with O cases; P source-column
cases are listed in `vim-cases.json`, and the mapping units cover every column documented above.
Cell-internal editing (`i a A I s S cc x r u .`, `h`/`l` hops, `Escape`, `ArrowDown` exits) is preserved.
EOF/start-of-note separators and operator/visual hops inside cells remain deliberately different.

## Provenance and limits

* `rea` (https://github.com/morluto/rea) was used for read-only inspection of the installed app bundle
  (`rea analyze-javascript-application` on `obsidian.asar`); the readable behaviour notes above come from the
  formatted `app.js`. No Obsidian code, CSS or assets are in this repository: the implementation is written from
  these observations.
* Measured with a Linux desktop Obsidian and synthetic CDP key events, not a physical Mac keyboard. IME and
  real Wayland input were not tested. Mouse-driven cell focus and `:` ex-commands other than `:w` in a cell were
  not measured here.
* `lastHPos` (the remembered Vim column) is the character column in the source line; wide characters
  and tabs were not measured.
