# Backlinks

Shows which notes link to the active note, with the line of each link, and
the notes that mention it by name without a link. The status bar shows how
many notes link to it. This is Obsidian's **Backlinks** core plugin.

## How it works

The view follows the active tab, in this editor or the text editor. Linked
mentions come from the vault index (`vault.backlinks`), which inverts each
note's resolved links; the lines are found by parsing each linking note's
current text. Unlinked mentions are computed only when that section is
expanded: every note that does not already link here is searched for the
note's basename and aliases as whole words, outside links and properties.

## Files

- `host.ts`: the plugin: view, status bar, refresh and the open command.
- `tree.ts`: the view's tree for one note.
- `mentions.ts`: linked and unlinked mention lines in a note's text.
- `manifest.ts`: the view contribution.

## Services, events and settings

- Injects the host services `hostCommands`, `views` and `activeEditor`, plus `vaults`. Listens to `vault/resolved`.
- Setting: `markdownWorkshop.plugins.backlinks.enabled`.

## Limits and differences from Obsidian

- The view is an Explorer section rather than a sidebar pane, and has no
  "show more context" or sort options yet.
- Unlinked mentions read every candidate note when expanded, which takes a
  moment in large vaults. Excluded files are skipped, as in Obsidian.
