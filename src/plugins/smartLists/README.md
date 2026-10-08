# Smart lists

Continues and exits Markdown list markup while editing, corresponding to
Obsidian's Smart lists setting.

## How it works

The plugin registers CodeMirror's Markdown keymap as an owned editor extension.
The Markdown language handles list continuation and markup deletion; disabling
the plugin removes the keymap without changing the document.

## Files

- `manifest.ts`: enablement and empty configuration schema.
- `webview.ts`: owned Markdown keymap registration.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`markdownWorkbench.plugins.smartLists.enabled` defaults to true. Enter/Backspace
behavior comes from the Markdown keymap; no palette commands.

## Limits and differences from Obsidian

Uses CodeMirror's Markdown list behavior. Editor-wide indentation settings remain
owned by Editor; this plugin does not override them.
