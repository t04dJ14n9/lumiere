# Smart lists

Continues and exits Markdown list markup while editing, corresponding to
Obsidian's Smart lists setting.

## How it works

The plugin registers an owned Enter/Shift+Enter keymap. Enter continues
bullets, numbers (renumbering the rest of an ordered list), quotes and tasks
(a new task starts unchecked), keeping the spaces before the caret; on an
empty item it leaves the list, or moves a nested item out one level; on an
empty quoted line it steps out one quote level; on an item's continuation
line it starts the next item. Shift+Enter breaks the line inside the block:
the new line keeps the quotes and lines up with a list item's text.
Backspace deletes one character, as in Obsidian. An edit inside an ordered
list numbers it again (`renumber.ts`), in the same undo step; opening a note
or editing elsewhere leaves its numbers alone. The list logic builds on
lang-markdown's continuation command, which works because the dialect shares
lang-markdown's language data. Disabling the plugin removes the keymap
without changing the document. Each rule was measured in Obsidian
(`docs/OBSIDIAN_KEYS.md`).

Pasting a list item onto an empty one keeps one marker, as Obsidian 1.14
does: the line's marker stays and the pasted one goes, a pasted checkbox
takes the place of the line's, and the other pasted lines stay as they are,
ordered ones numbered again (`paste.ts`).

## Files

- `manifest.ts`: enablement and empty configuration schema.
- `commands.ts`: Enter and Shift+Enter commands.
- `webview.ts`: owned keymap registration.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`lumiere.markdown.plugins.smartLists.enabled` defaults to true. Enter and
Shift+Enter are the only bindings; no palette commands.

## Limits and differences from Obsidian

Tab/Shift+Tab indentation belongs to Editor. Editor-wide indentation settings remain
owned by Editor; this plugin does not override them.
