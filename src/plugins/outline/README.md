# Outline

Shows the active note's headings beside this editor, with Collapse All,
Expand All and an optional Follow Cursor toggle. Clicking a heading jumps to
its section, like Obsidian's **Outline** core plugin. In the Markdown Workbench
custom editor, a `DocumentSymbolProvider` feeds VS Code's Go to Symbol and the
native Outline sidebar; the plain text editor still uses VS Code's built-in
Markdown symbols.

## How it works

The view parses the active panel's authoritative document text into nested
headings and refreshes after edits. Follow Cursor defaults to on; its checked
overflow action persists `outline.followCursor` through VS Code settings.
When enabled, cursor movement, panel changes and view visibility reveal and
select the current section without taking focus. Version and panel identity
guards discard stale captures. Collapse All uses VS Code's native tree action;
Expand All reveals every node in order so deeply nested headings also expand.
Clicking a heading opens the note at its offset; the links plugin's `navigate` then
scrolls that offset to the vertical centre of the editor, as VS Code's Outline
(`revealRange` with `InCenter`) and Obsidian's do. Near the start or end of a
note the scroll range ends first, so the heading stays above or below the
centre.

Ctrl+Alt+O (Control+Command+O on macOS) toggles Note Outline while the
Workbench editor is active, matching PDF Workshop's outline shortcut.

## Files

- `host.ts`: the plugin registrations and editor/document event routing.
- `document-symbols.ts`: `DocumentSymbolProvider` for the custom editor.
- `symbols.ts`: nested heading symbols shared with Go to Symbol / Outline.
- `tree.ts`: heading nodes, parent lookup and editor-to-source coordinates.
- `view.ts`: refresh timing, cursor following and expansion traversal.
- `actions.ts`: commands, configuration reads and the follow context key.
- `commands.ts`: view, command, setting and context identifiers.
- `headings.ts`: nesting headings and finding the caret's section.
- `manifest.ts`: view/title actions, the view, keybinding and the follow setting.

## Services, events and settings

- Injects `workbench` (views and settings), `vaults` (navigation) and `editors`.
- Listens to `editor/opened`, `editor/closed`, `editor/ready`,
  `editor/activeChanged`, `editor/selectionChanged` and `document/changed`,
  plus native configuration and tree visibility changes. Emits no events and
  provides no services.
- Settings: `markdownWorkbench.plugins.outline.enabled` and
  `markdownWorkbench.outline.followCursor` (default `true`, resource-scoped).
- Commands: `markdownWorkbench.outline.expandAll`,
  `markdownWorkbench.outline.enableFollowCursor`,
  `markdownWorkbench.outline.disableFollowCursor` and
  `markdownWorkbench.outline.toggle`; internal navigation uses
  `markdownWorkbench.outline.open`.

## Limits and differences from Obsidian

- No drag-and-drop reordering of sections.
- The DocumentSymbolProvider only answers while the Markdown Workbench custom
  editor is the active tab, so the built-in Markdown provider still owns the
  plain text editor alone.
