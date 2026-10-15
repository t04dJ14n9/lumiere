# Indentation guides

Shows indentation guides on source lines, corresponding to Obsidian's Show
indentation guides setting.

## How it works

A viewport view plugin calculates indentation in columns, accounting for tab
stops, and adds line decorations. `indentGuides.css` draws repeating guides
using VS Code colors. The decorations are an owned editor registration.

## Files

- `manifest.ts`: enablement and empty configuration schema.
- `webview.ts`: indentation calculation and viewport decoration.
- `indentGuides.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`markdownWorkshop.plugins.indentGuides.enabled` defaults to true. No commands
or keybindings; tab size belongs to Editor.

## Limits and differences from Obsidian

Guides use VS Code theme colors and source indentation, with no active-guide
tracking. Exact appearance is left to the owner's visual comparison.
