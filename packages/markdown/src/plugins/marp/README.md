# Marp

Detects a Marp deck (`marp: true` in the opening frontmatter) and bridges to VS Code's preview and to Marp for VS Code's export. A deck inside the wiki bundle is not given a page contract.

## How it works

The same check Marp uses decides whether the note is a deck, and sets `markdownWorkshop.isMarp`. Open Marp Preview to the Side runs `markdown.showPreviewToSide`. Export Marp Slide Deck shows the file in a text editor and then runs `markdown.marp.export`. In an untrusted workspace export is refused. If Marp for VS Code is not installed, export offers to search Extensions for `marp-team.marp-vscode`. Toggle Marp inserts or flips `marp: true` and leaves the rest of the frontmatter. With `markdownWorkshop.marp.open` set to `textEditor`, opening a deck in this editor sends it to the text editor unless Keep Marp Deck in Workshop remembered that file. Move Marp Deck Outside Bundle moves a deck that sits inside the wiki bundle into `exports` (or the layout's exports path) without adding `type` or `generated`, and copies a portable Markdown link.

## Files

- `host.ts`: commands, the context key, and the text-editor redirect.
- `actions.ts`: preview, export, toggle, keep and move.
- `redirect.ts`: the pure redirect decision.
- `keep.ts`: the per-workspace allow list.
- `manifest.ts`: commands and `marp.open`.

## Services, events and settings

- Requires `workbench`. Optionally uses `editors` and `wikiLayout`.
- Listens to `editor/opened` and `editor/activeChanged`.
- Sets `markdownWorkshop.isMarp` (cleared when the plugin stops).
- Command: `markdownWorkshop.marp.keepInWorkshop` (**Keep Marp Deck in Workshop**) remembers the deck and reopens it in this editor.
- Setting: `markdownWorkshop.marp.open` (`workbench` or `textEditor`, default `workbench`).
- Setting: `markdownWorkshop.plugins.marp.enabled`.

## Limits and differences from Obsidian

- Slide dividers, directive chips and Marp themes are not drawn in this editor. Preview and export belong to VS Code and Marp for VS Code.
- A deck inside the bundle that lacks `type` and `generated` provenance is reported by the Wiki plugin. This plugin will not add those fields.
- There is no default keybinding. Ctrl+K V stays with VS Code's preview.
