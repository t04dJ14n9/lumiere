# Line numbers

Shows a source line-number gutter laid out like VS Code's text editor, so a note
looks the same in Markdown Workbench and in **Open With > Text Editor**. It is on
by default and follows `editor.lineNumbers` for Markdown files.

## How it works

The plugin registers its own CodeMirror gutter through Editor. Numbers use the
note's font family, size, weight and line height (see the editor
plugin's font settings: `markdownWorkbench.editor.fontSize` and `lineHeight`), VS Code's `editorLineNumber.foreground`
colour (`activeForeground` on the caret line), right-aligned in a column at least
five digits wide, like VS Code's `lineNumbersMinChars`. Each number is centred on
its text line; heading lines get the heading's padding and line height. The
gutter sits at the editor's left edge on the editor background, with the folding
area between numbers and text, as in VS Code.

`editor.lineNumbers` is read on the host for Markdown files (`on`, `off`,
`relative`, `interval`): relative shows distances from the caret line and
interval every tenth number; the caret line always shows its own number. A
rendered block (table, callout, embed, math, diagram, properties) hides several
source lines. As in Obsidian 1.14.4 (measured: `docs/obsidian-measurements/tables/line-numbers*.mjs`),
it gets **one** number, that of its first source line, at the top of the block, and the
hidden lines are not numbered (a three-row table on lines 3-6 shows `3`, then `7`). The
number of a table is lowered to sit level with its header row. An earlier version stacked
a number per hidden line beside the block; the stack could not line up with rows of a
different height and left a gap after the block.
Catalog rank places line numbers before folding.

## Files

- `manifest.ts`: default-on enablement; `style` is read from `editor.lineNumbers`
  (`nativeConfigKeys`), so no extra setting is contributed.
- `webview.ts`: owned gutter registration and reconfiguration.
- `gutter.ts`: labels per style, one number per rendered block, the gutter.
- `gutter.test.ts`: labels, block numbering and marker equality.
- `headings.ts`: gutter classes on heading lines, so numbers align with the
  larger heading text.
- `lineNumbers.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`markdownWorkbench.plugins.lineNumbers.enabled` defaults to true;
`editor.lineNumbers` (VS Code's setting) picks the style. No commands or
keybindings.

## Limits and differences from VS Code

Rows follow the note's Live Preview line heights (headings are taller), so the
gutter is as tall as the text it numbers rather than VS Code's fixed line
height. Hidden lines of a rendered block have no number (VS Code's text editor numbers every
source line; Obsidian does not).
Folded lines are not numbered, as in VS Code.
