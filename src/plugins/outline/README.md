# Outline

Shows the active note's headings beside this editor, selects the heading of
the section the caret is in, and jumps to a heading when clicked. This is
Obsidian's **Outline** core plugin. In the text editor, VS Code's own Outline
and breadcrumbs already list Markdown headings.

## How it works

The view parses the active panel's current text into nested headings
(`headings.ts`) and refreshes after edits. When the caret moves, it asks the
panel for the caret position and selects that section's heading.

## Files

- `host.ts`: the plugin and the view's tree.
- `headings.ts`: nesting headings and finding the caret's section.
- `manifest.ts`: the view contribution, shown only beside this editor.

## Services, events and settings

- Injects `workbench` (views), `vaults` (current text) and `editors`.
- Listens to `editor/activeChanged`, `editor/selectionChanged` and
  `document/changed`.
- Setting: `markdownWorkbench.plugins.outline.enabled`.

## Limits and differences from Obsidian

- No drag-and-drop reordering of sections or collapse-all button yet.
- It does not register a document symbol provider: VS Code's Markdown
  support already provides one, and a second would list every heading twice.
