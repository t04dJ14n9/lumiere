# Vim caret

Reference: **VSCodeVim** (`vscodevim.vim` 1.32.4) running in VS Code 1.141, the
Vim extension most people mean by "Vim in VS Code". It was installed into an
isolated profile (`code --extensions-dir /tmp/vsvim/ext --user-data-dir
/tmp/vsvim/ud`), driven over CDP on a visible display, and measured from the
DOM, its source and screenshot pixels (scripts and raw results:
`docs/vim-caret-measurements/`, side-by-side images:
`docs/screenshots/vim-caret-vs-vscodevim/`). Earlier work compared the caret
with the built-in editor's block/line/underline and the owner's Cursor
screenshot; VSCodeVim is now the reference, and where it differs from that
earlier reading the VSCodeVim behaviour wins.

## What VSCodeVim does

VSCodeVim draws no caret of its own. It tells the editor which native cursor
style to use for the current mode, and in visual mode adds a text decoration:

| Mode | Native cursor VS Code draws | Extra |
| --- | --- | --- |
| Normal | `block` (10 x 24 px at 16 px DejaVu Sans Mono, line height 24), `editorCursor.foreground`, the character drawn inside in the editor's text-on-cursor colour | The block stays while `r`, `f`, `"`, a count or `g` wait for their key |
| Insert | the user's own `editor.cursorStyle` and `editor.cursorWidth` (all six styles; line 2 px, line-thin 1 px, block, block-outline, underline, underline-thin) | none |
| Replace (`R`) | `underline`, 2 px, full character width | none |
| Visual, visual line, visual block | `line-thin`, 1 px, at the selection's end (after the active character for a forward selection) | A decoration on the active character: `editorCursor.foreground` background, 1 px border of the same colour, text colour `rgb(81,80,82)` (dark themes) or white (light themes). An empty line shows only the two border pixels |
| Operator pending (after `d`, `y`, `c`, `>`...) | `underline-thin` | A block over the lower half (12 of 24 px) of the character, the character drawn over it |
| Search `/` or ex `:` prompt | `underline-thin`: one pixel row at the bottom of the character's cell, full character width | none |

Everything else is the built-in editor's own caret behaviour, measured in the
same sessions:

| Behaviour | Measured |
| --- | --- |
| Position | Whole pixels counted from the text start of the line: the block for the character at offset 57.8 is at 58, at 125.3 at 125. Block and underline widths are the rounded character width (9.64 becomes 10, a 16.02 px CJK character 16, an emoji 20) |
| Insert line | A line two or more pixels wide sits one pixel left of the character's edge so it straddles the boundary (measured: block at 106, insert line at 105); at column 0 it is not shifted. A one-pixel line (line-thin, the visual end caret) is not shifted |
| Empty line | Block at the line start, the default character width (9.625 px) wide |
| Wide characters | The block covers the whole character: CJK 16 px, emoji 20 px; `l` over an emoji steps over all of it |
| Esc from insert | The caret steps one character left (and from `A` it lands on the last character) |
| `blink` | A hard blink: 500 ms visible, 500 ms hidden, indefinitely while focused. |
| `smooth` | Opacity 1 until 20 % of 0.5 s, down to 0 at 60 %, `ease-in-out`, `alternate`, 20 iterations (10 s), then solid; visible 400 ms, hidden 600 ms per second |
| `phase` | The same with the fade complete at 90 % (visible 550 ms, hidden 450 ms) |
| `expand` | The same timing, `scaleY` 1 to 0 between 20 % and 80 % |
| `solid` | No animation |
| `cursorSmoothCaretAnimation` | `on`: `transition: 80ms` (ease) on left, top, width and height; the caret reaches its target in about 6 frames. `explicit`: no animation for VSCodeVim's motions (`l`, `$`, typing), because it moves the cursor from code; arrows and clicks in a normal editor do animate. `off`: none |

## Ours before and after

| Case | Ours before | Now |
| --- | --- | --- |
| Whole-pixel positions | Fractional (`57.8` where VS Code draws `58`) | Rounded relative to the line's text start; block width is the rounded character width |
| Insert line | Starts at the character edge (one pixel right of VS Code's) | Straddles it like the built-in line caret |
| Hard blink | 1.2 s period, 600 ms on and 600 ms off | 1 s: 500 ms on, 500 ms off |
| `smooth`, `phase`, `expand` | 1.2 s linear, infinite; other keyframes (`expand` collapsed to the bottom) | 0.5 s `ease-in-out` alternate, 20 iterations then solid, VS Code's keyframes and its centred `scaleY` |
| Smooth movement | `ease-out` on `transform, left, top` | `ease` on `left, top, width, height` (VS Code's `transition: 80ms`) |
| `explicit` smooth movement | Animated every Vim motion | Only pointer moves animate in a modal editor (VSCodeVim's motions do not) |
| Visual | A block only, `editorCursor.background` glyph | The same block with VSCodeVim's glyph colour (dark `rgb(81,80,82)`; white in light themes) plus the one-pixel caret at the selection's end; two pixels on an empty line |
| Pending `r` | Underline | The normal block (VSCodeVim does not change it) |
| Operator pending (`d`, `y`...) | Normal block | The lower half of the character |
| Search / ex prompt | Caret hidden (the prompt took focus) | A one-pixel underline under the character, blinking |
| Insert with `editor.cursorStyle: block` (or any other) | Always a line | The editor's own style, like VSCodeVim |

`editor.cursorStyle` applies when Vim is off and, with Vim on, in insert mode.
The other Vim modes choose their own shape. `editor.cursorBlinking`,
`cursorSmoothCaretAnimation` and `editor.cursorWidth` (line carets) apply as
described above. The editor's small presentation layer keeps `drawSelection`
for selection backgrounds and hides its own cursors and codemirror-vim's cursor
layer. Measuring the character preserves its font, actual width and glyph
(including a complete grapheme); a persistent DOM element makes movement
transitions possible. Blank lines and line ends use CodeMirror's default
character width. Unfocused blocks become outlines, except while the search or ex
prompt holds focus. Colours use `--vscode-editorCursor-foreground` and
`--vscode-editorCursor-background`, falling back to the editor's foreground and
background.

## Comparison results

`docs/vim-caret-measurements/compare.py` lines up every state both extensions
were driven through (same file contents, font, theme and keys; 32 states) and
compares the shapes in pixels relative to the first character of the first line.
All but one match within one pixel: position, width, height and colour for
normal mode at line start/end, on short and empty lines, on CJK, accented,
combining and emoji characters, and after stepping over an emoji; insert,
insert at line end and after `a`/`A`; Esc positions; replace; visual
(empty, forward, backward, line); operator pending; search and ex prompt.

Not matched: **visual block** (`Ctrl-v`). VSCodeVim shows one native cursor per
selected line and a decoration on the last; ours shows the primary pair only.
Also not reproduced: VSCodeVim's insert-mode pending-key preview (the decoration
after `Ctrl-v`/`Ctrl-r`), its `vim.cursorStylePerMode.*`, `vim.highlightedyank`
and EasyMotion/surround modes (all VSCodeVim settings or plugins, not ours).

Screenshots, VSCodeVim on top and ours below each pair, 4x:
`docs/screenshots/vim-caret-vs-vscodevim/normal.png`,
`insert-replace.png`, `visual.png`, `pending-prompt.png`.

## Verification

Unit coverage lives in the editor and Vim plugins. Runtime checks:

| What | Where | Result |
| --- | --- | --- |
| Our caret vs the **built-in editor's** caret, in the real editor: normal, visual, insert and replace against `editor.cursorStyle` block, line and underline. Both are measured from the DOM and from the pixels of a real screenshot (caret rectangle, colour, legible glyph in the block). | `test/vscode/vim-caret.spec.ts`, run on VS Code 1.141 and Cursor 3.24.9 on a visible X display |
| Our caret **position and size relative to the line's text start**, in five columns (9.64 px characters, so rounding goes both ways), against the built-in caret for normal (block), visual (block plus line-thin at the end), insert (line) and replace (underline); the operator-pending half block and the prompt underline. | `test/vscode/vim-caret-vscodevim.spec.ts` | Equal to the pixel at every column. |
| VSCodeVim's pixel rules and timings in Chromium: whole-pixel blocks, the straddling insert line, the visual end caret and its two pixels on an empty line, Esc from `A`, `explicit` movement, blink restart, 20 alternating half cycles. | `test/browser/vim-caret-vscodevim.spec.ts` | Pass. | Same width, same height relative to the line (24 px line: block and line carets 24 px, underline 2 px), same colour. Screenshots: `docs/screenshots/vim-caret-vs-builtin-vscode.png`, `docs/screenshots/vim-caret-vs-builtin-cursor.png`. |
| Emoji, ZWJ sequences, combining marks, CJK, right-to-left Hebrew and Arabic: the block covers the complete grapheme at every Vim position and its box equals the browser's own range box. | `test/browser/vim-caret-geometry.spec.ts` | Pass at device scale 1 and 2. |
| Ligature font (Fira Code with ligatures): the block covers one character cell and shows one character. | same | Pass. |
| Lifecycle: Vim turned off, panels opened and disposed, two panels: one layer per editor, no listener count change on the page/window, no caret node outliving its editor. | same | Pass. |
| Native cursor settings (styles, blinking durations, timing functions, iteration counts, movement) and every Vim mode's shape in Chromium. | `test/browser/vim-caret.spec.ts` | Pass. |

Found by these checks and fixed: a Vim position inside a grapheme cluster
(`l` steps by code point, so it can land between `e` and its combining accent)
drew the block over the lone combining mark; the block now covers the whole
cluster. The block also only covered the glyph box (19 px of a 24 px line); like
the built-in caret it now fills the line box.

What the comparison is, and is not: VSCodeVim itself is the reference above, and
the real-editor specs use the built-in editor with the matching
`editor.cursorStyle` as a stand-in for it (VSCodeVim only sets that style), so
they need no marketplace access. Not measured: right-to-left
screenshots in the real editor (RTL is covered in Chromium only), a real
high-density display (device scale 2 is emulated in Chromium), and ligature
fonts in the real editor. The branch does not contain the editor-font fix, so
the real-editor spec compares each caret with its own editor's line height and
sets the font and line height explicitly.

The pinned source checkout `~/Code/human-learning` is unavailable in this
workspace; the installed codemirror-vim 6.3.0 source was inspected directly.

## Real VS Code check

`docs/screenshots/vim-caret-modes.png`: this extension in real VS Code with
`editor.cursorBlinking: solid` — normal (block over the character, glyph still
readable), visual (selection plus block at the head), insert (line) and replace
(underline), in that order.

## Reproducing the VSCodeVim measurements

```
code --extensions-dir /tmp/vsvim/ext --user-data-dir /tmp/vsvim/ud --install-extension vscodevim.vim
cd docs/vim-caret-measurements
node vscodevim.mjs solid off     # VSCodeVim: every state in scenario.mjs
node ours.mjs solid off          # this extension (vsix in /tmp/vsvim/ext-ours)
python3 compare.py solid         # shape-by-shape comparison
python3 montage.py               # side-by-side crops
node timing.mjs                  # VSCodeVim blink and movement timing
node timing-ours.mjs             # ours
node styles.mjs                  # how each mode follows editor.cursorStyle
```

They open a separate window on `DISPLAY` (`:7` by default; set
`DISPLAY_FOR_CARET`), use only the throwaway profile above and kill it when
done. Raw results are in `docs/vim-caret-measurements/results/`.
