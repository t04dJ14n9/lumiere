# Outgoing links

Shows the files the active note links to, its links whose note does not
exist yet, and (when expanded) other notes mentioned by name without a link.
This is Obsidian's **Outgoing links** core plugin.

## How it works

The view follows the active tab and reads the note's resolved and unresolved
links from the vault index, refreshing when indexing settles. Unlinked
mentions scan the active note's text for other notes' basenames and aliases
outside any link (same matcher as Backlinks), only when that section expands.

## Files

- `host.ts`: the plugin: view, refresh and the open command.
- `tree.ts`: the view's tree for one note.
- `manifest.ts`: the view contribution.

## Services, events and settings

- Injects the host services `hostCommands`, `views` and `activeEditor`, plus `vaults`. Listens to `vault/resolved`.
- Setting: `lumiere.markdown.plugins.outgoingLinks.enabled`.

## Limits and differences from Obsidian

- Clicking a link not created yet does nothing; follow it in the note to
  create it.
- Unlinked mentions read the active note once per expand; very large vaults
  still walk every candidate basename (same cost class as Backlinks unlinked,
  but only one file body is read).
