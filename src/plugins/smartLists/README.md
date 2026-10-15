# Smart lists

Continues and exits Markdown list markup while editing, corresponding to
Obsidian's Smart lists setting.

## How it works

The plugin registers an owned Enter/Backspace keymap. Enter continues bullets,
numbers (renumbering the rest of an ordered list), quotes and tasks (a new task
starts unchecked); on an empty item it leaves the list, or moves a nested item
out one level. Backspace right after an item's marker removes the marker. The
list logic builds on lang-markdown's continuation command, which works because
the dialect shares lang-markdown's language data. Disabling the plugin removes
the keymap without changing the document.

## Files

- `manifest.ts`: enablement and empty configuration schema.
- `commands.ts`: Enter and Backspace commands.
- `webview.ts`: owned keymap registration.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`markdownWorkshop.plugins.smartLists.enabled` defaults to true. Enter/Backspace
are the only bindings; no palette commands.

## Limits and differences from Obsidian

Tab/Shift+Tab indentation belongs to Editor. Editor-wide indentation settings remain
owned by Editor; this plugin does not override them.
