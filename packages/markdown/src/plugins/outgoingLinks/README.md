# Outgoing links

Shows the files the active note links to, and its links whose note does not
exist yet. This is Obsidian's **Outgoing links** core plugin.

## How it works

The view follows the active tab and reads the note's resolved and unresolved
links from the vault index, refreshing when indexing settles.

## Files

- `host.ts`: the plugin: view, refresh and the open command.
- `tree.ts`: the view's tree for one note.
- `manifest.ts`: the view contribution.

## Services, events and settings

- Injects `workbench` (views) and `vaults`. Listens to `vault/resolved`.
- Setting: `markdownWorkshop.plugins.outgoingLinks.enabled`.

## Limits and differences from Obsidian

- Unlinked mentions of other notes (Obsidian's second section) are not shown.
- Clicking a link not created yet does nothing; follow it in the note to
  create it.
