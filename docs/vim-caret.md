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

Unit coverage lives in the editor and Vim plugins. The single
`test/browser/vim-caret.spec.ts` scenario checks real key transitions and computed
geometry/colours, then checks native typing styles, blinking and movement settings.
The pinned source checkout `~/Code/human-learning` is unavailable in this
workspace; the installed codemirror-vim 6.3.0 source was inspected directly.

Validation: formatting, lint, all TypeScript projects, the build and 66 focused
unit assertions passed. Re-running the editor defaults and native-caret settings
regression against the original `HEAD` manifest fails on the four missing cursor
fields. The targeted Playwright spec was discovered and built, but Chromium
aborted at launch with `sandbox_host_linux.cc:41` / `Operation not permitted`;
its runtime style/geometry assertions remain for the owner to run.

## Real VS Code check

`docs/screenshots/vim-caret-modes.png`: this extension in real VS Code with
`editor.cursorBlinking: solid` — normal (block over the character, glyph still
readable), visual (selection plus block at the head), insert (line) and replace
(underline), in that order.
