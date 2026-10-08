# Indentation guides

Shows indentation guides on source lines, corresponding to Obsidian's Show
indentation guides setting.

## How it works

A viewport view plugin calculates indentation in columns, accounting for tab
stops, and adds line decorations. A base theme draws repeating guides using
VS Code colors. Both the decorations and theme are owned editor registrations.

## Files

- `manifest.ts`: enablement and empty configuration schema.
- `webview.ts`: indentation calculation, viewport decoration and theme.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`markdownWorkbench.plugins.indentGuides.enabled` defaults to true. No commands
or keybindings; tab size belongs to Editor.

## Limits and differences from Obsidian

Guides use VS Code theme colors and source indentation, with no active-guide
tracking. Exact appearance is left to the owner's visual comparison.
