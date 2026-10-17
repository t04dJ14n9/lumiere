# Link updates

When a note or attachment is renamed or moved in VS Code, rewrites the links
to it in other notes. This is Obsidian's **Automatically update internal
links** setting.

## How it works

Before VS Code renames files, the plugin finds every note that links to them
(through the vault index's backlinks), re-reads each note's current text and
rewrites only the path of each link: a wikilink stays a wikilink, a Markdown
link stays a Markdown link, and `#subpaths` and aliases are kept. The path is
written in the new-link format. A moved note's own path-style links are
rewritten too. Folder renames cover every file inside. By default it asks
first; the edits are applied together with the rename, so one undo reverts
them.

## Files

- `host.ts`: the rename hook, the prompt and folder expansion.
- `rewrite.ts`: the edits for one note.
- `manifest.ts`: the plugin's switch and `mode` setting.

## Services, events and settings

- Injects `workbench` (views) and `vaults`.
- Settings: `markdownWorkshop.linkUpdates.mode` (`prompt`, `always`,
  `never`), `markdownWorkshop.links.newLinkFormat`.

## Limits and differences from Obsidian

- Only renames made in VS Code (Explorer, refactoring) are seen; a rename in
  another program looks like a delete and a create.
- Heading renames do not update `#Heading` links yet.
