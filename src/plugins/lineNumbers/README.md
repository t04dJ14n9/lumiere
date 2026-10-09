# Line numbers

Shows a source line-number gutter, corresponding to Obsidian's Show line numbers
setting. It defaults to off.

## How it works

The plugin registers CodeMirror's line-number extension through Editor. Catalog
rank places line numbers before folding, so gutter order survives off/on cycles.
Disposal removes only this registration.

## Files

- `manifest.ts`: default-off enablement and empty configuration schema.
- `webview.ts`: owned line-number extension registration.
- `headings.ts`: gutter classes on heading lines, so numbers align with the
  larger heading text.
- `lineNumbers.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`markdownWorkbench.plugins.lineNumbers.enabled` defaults to false. No commands
or keybindings.

## Limits and differences from Obsidian

Uses CodeMirror's gutter and VS Code colors. Counts source document lines, not
individual visual rows inside rendered widgets.
