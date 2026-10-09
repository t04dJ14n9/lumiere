# Line numbers

Shows a source line-number gutter, corresponding to Obsidian's Show line numbers
setting. It defaults to off.

## How it works

The plugin registers CodeMirror's line-number extension through Editor. A
rendered block replaces whole lines, which CodeMirror leaves unnumbered, so a
widget marker gives it its first line's number. Catalog
rank places line numbers before folding, so gutter order survives off/on cycles.
Disposal removes only this registration.

## Files

- `manifest.ts`: default-off enablement and empty configuration schema.
- `webview.ts`: owned line-number extension registration.
- `headings.ts`: gutter classes on heading lines, so numbers align with the
  larger heading text.
- `widgets.ts`: numbers a rendered block with its first source line.
- `widgets.test.ts`: which widgets get a number, and marker equality.
- `lineNumbers.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`markdownWorkbench.plugins.lineNumbers.enabled` defaults to false. No commands
or keybindings.

## Limits and differences from Obsidian

Uses CodeMirror's gutter and VS Code colors. Counts source document lines, not
visual rows: a rendered block (table, callout, embed, math, diagram) shows the
number of its first source line, as in Obsidian, and the lines it hides are
skipped.
