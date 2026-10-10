# Vim caret

Reference: the owner's Cursor built-in editor screenshot, with a solid block
covering one character and the character still readable.

| Mode | Our caret before this change | Target | Change |
| --- | --- | --- | --- |
| Vim normal | codemirror-vim's pink fat cursor; original text colour, partial block during pending commands | One-character block in `editorCursor.foreground`, readable character in `editorCursor.background` | Draw a measured character with the two native theme colours |
| Vim visual (character, line, block) | The same fat cursor, with secondary cursors supplied by the library | The same full block as normal, at the active character | Keep selection backgrounds and draw blocks at the Vim selection heads |
| Vim insert (`i`) | CodeMirror's thin cursor; native width and animation settings ignored | Line cursor using `editor.cursorWidth` | Use the native line width, blinking and movement settings |
| Vim replace (`R`, Insert in insert mode) | Pink bottom fifth of the character | Two-pixel underline across one character | Read `cm.state.overwrite` while `vim.insertMode` is true |
| Vim single replace (pending `r`, also counted `3r`) | Partial pink block while waiting for the replacement character | The same underline until replacement or Escape | Read `vim.expectLiteralNext` and `vim.inputState.keyBuffer` |
| Vim off (normal typing) | CodeMirror's thin cursor; native style and animation settings ignored | Native line, block, underline, line-thin, block-outline or underline-thin | Read native cursor settings through the editor manifest and settings compartment |

`editor.cursorStyle` applies when Vim is off. Vim's current mode chooses the
shape when it is on. `editor.cursorBlinking` applies to both: hard blink,
smooth fade, soft phase, vertical expansion, or solid. Movement transitions
follow `editor.cursorSmoothCaretAnimation`: off, explicit selection moves only,
or all moves. `editor.cursorWidth` applies to line cursors; line-thin stays 1 px.

The editor's small presentation layer keeps `drawSelection` for selection
backgrounds and hides its cursors and codemirror-vim's cursor layer. Measuring
the character preserves its font, actual width and glyph (including a complete
grapheme); a persistent DOM element makes movement transitions possible. Blank
lines and line ends use CodeMirror's default character width. Unfocused blocks
become outlines.
Colours use `--vscode-editorCursor-foreground` and
`--vscode-editorCursor-background`, falling back to the editor's foreground and
background. There is no dependency on the editor-font branch's `#default` rule.

## Verification

Unit coverage lives in the editor and Vim plugins. Runtime checks:

| What | Where | Result |
| --- | --- | --- |
| Our caret vs the **built-in editor's** caret, in the real editor: normal, visual, insert and replace against `editor.cursorStyle` block, line and underline. Both are measured from the DOM and from the pixels of a real screenshot (caret rectangle, colour, legible glyph in the block). | `test/vscode/vim-caret.spec.ts`, run on VS Code 1.141 and Cursor 3.24.9 on a visible X display | Same width, same height relative to the line (24 px line: block and line carets 24 px, underline 2 px), same colour. Screenshots: `docs/screenshots/vim-caret-vs-builtin-vscode.png`, `docs/screenshots/vim-caret-vs-builtin-cursor.png`. |
| Emoji, ZWJ sequences, combining marks, CJK, right-to-left Hebrew and Arabic: the block covers the complete grapheme at every Vim position and its box equals the browser's own range box. | `test/browser/vim-caret-geometry.spec.ts` | Pass at device scale 1 and 2. |
| Ligature font (Fira Code with ligatures): the block covers one character cell and shows one character. | same | Pass. |
| Lifecycle: Vim turned off, panels opened and disposed, two panels: one layer per editor, no listener count change on the page/window, no caret node outliving its editor. | same | Pass. |
| Native cursor settings (styles, blinking, movement) in Chromium. | `test/browser/vim-caret.spec.ts` | Pass. |

Found by these checks and fixed: a Vim position inside a grapheme cluster
(`l` steps by code point, so it can land between `e` and its combining accent)
drew the block over the lone combining mark; the block now covers the whole
cluster. The block also only covered the glyph box (19 px of a 24 px line); like
the built-in caret it now fills the line box.

What the comparison is, and is not: VS Code has no Vim mode of its own. Vim
extensions draw their block caret with the built-in editor's `block` style, so
the built-in `editor.cursorStyle` is the reference for "the built-in editor
caret in Vim normal mode"; the VSCodeVim extension itself was not installed.
The owner's reference screenshot (a block over one character, the character
still readable) agrees with these captures. Not measured: right-to-left
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
