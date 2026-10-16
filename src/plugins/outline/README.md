# Outline

Shows the active note's headings beside this editor, with Collapse All,
Expand All and an optional Follow Cursor toggle. Clicking a heading jumps to
its section, like Obsidian's **Outline** core plugin. **Go to Heading…** searches
these headings in a native Quick Pick while the Workbench editor is active.

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

Ctrl+Shift+O (Command+Shift+O on macOS), or **Markdown Workshop: Go to
Heading…** in the command palette, opens a searchable heading picker. It reads
the active panel's authoritative text, shows heading levels and parent titles,
and navigates through the same path as the tree. Dismissed or stale picks
(edited document, changed panel or stopped plugin) do not navigate.

Ctrl+Alt+O (Control+Command+O on macOS) toggles Note Outline while the Workbench
editor is active (editor-scoped keybinding, so PDF Workshop keeps the same keys).
The command palette entry is workbench/config-gated like Quick Switcher. Hiding
targets the view itself, including after moving it to the secondary sidebar or
panel; showing restores and focuses it in its current location.

When a Markdown Workshop editor becomes active, the plugin hides VS Code's
native **Outline**, shows **Note Outline** and **Tags**, then returns focus to
the editor. Leaving the last Workshop editor restores the native Outline after a
short debounce; restore is skipped if PDF Workshop (or another Workshop editor) already owns the active tab. Manual
changes to Outline while a Workshop editor stays active are left alone until the
next enter/leave. Tags also use the same `activeCustomEditorId` when-clause as
Note Outline so they do not linger beside non-Workshop editors.


## Files

- `host.ts`: the plugin registrations and editor/document event routing.
- `symbol-picker.ts`: searchable headings and guarded navigation for Quick Pick.
- `symbols.ts`: nested heading symbols with enclosing section ranges.
- `tree.ts`: heading nodes, parent lookup and editor-to-source coordinates.
- `view.ts`: refresh timing, cursor following and expansion traversal.
- `actions.ts`: commands, configuration reads and the follow context key.
- `focus.ts`: native Outline ↔ Note Outline/Tags enter/leave swap.
- `commands.ts`: view, command, setting and context identifiers.
- `headings.ts`: nesting headings and finding the caret's section.
- `manifest.ts`: view/title actions, the view, keybinding and the follow setting.

## Services, events and settings

- Injects `workbench` (views and settings), `vaults` (navigation) and `editors`.
- Listens to `editor/opened`, `editor/closed`, `editor/ready`,
  `editor/activeChanged`, `editor/selectionChanged` and `document/changed`,
  plus native configuration and tree visibility changes. Emits no events and
  provides no services.
- Maintains `markdownWorkshop.plugin.outline` while the window plugin is
  running, so editor-scoped shortcuts (Go to Heading, Ctrl+Alt+O) reflect its
  lifetime. The Toggle Note Outline palette entry uses workbench/config gating.
- Settings: `markdownWorkshop.plugins.outline.enabled` and
  `markdownWorkshop.outline.followCursor` (default `true`, resource-scoped).
- Commands: `markdownWorkshop.outline.expandAll`,
  `markdownWorkshop.outline.enableFollowCursor`,
  `markdownWorkshop.outline.disableFollowCursor` and
  `markdownWorkshop.outline.toggle` and `markdownWorkshop.outline.goToHeading`;
  internal navigation uses
  `markdownWorkshop.outline.open`.

## Limits and differences from Obsidian

- No drag-and-drop reordering of sections.
- VS Code's native Outline and breadcrumbs require an editor integration that
  the supported CustomTextEditorProvider API does not supply. Workbench uses
  Note Outline and Go to Heading. The plain text editor uses VS Code's built-in
  Markdown symbols and Ctrl+Shift+O; this plugin registers no symbol provider,
  so split editors cannot cache duplicate headings from Workbench.
