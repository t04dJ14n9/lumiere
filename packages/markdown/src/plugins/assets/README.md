# Assets

Imports a file you pick into the project's assets folder and inserts a portable Markdown link. The folder is created on that import. This is not Obsidian's attachment graph.

## How it works

Import Asset asks for a file. The destination is `.wiki/layout.json`'s `assets` path when that layout loaded, otherwise `lumiere.markdown.assets.path`, otherwise `assets`. A path inside the wiki bundle is refused. If the file name already exists, ignoring case, you can replace it, keep both (`name-2.ext`), or cancel. The folder is created only after that choice. A symbolic link anywhere on the destination path cancels the import. The link is relative to the open note (`![label](../assets/figure.png)` for an image, `[label](...)` otherwise). With no open note, the link is copied.

## Files

- `host.ts`: the command and the open note.
- `run.ts`: choose, copy, and insert.
- `plan.ts`: path checks and collision names.
- `link.ts`: the portable link.
- `manifest.ts`: the command and `assets.path`.

## Services, events and settings

- Requires the host services `hostDocuments`, `hostCommands`, `clipboard`, `dialogs`, `activeEditor`, `settings` and `workspace`. Optionally uses `editors` and `wikiLayout`.
- Does not provide a service.
- Setting: `lumiere.markdown.assets.path` (empty defers to the layout, then `assets`).
- Setting: `lumiere.markdown.plugins.assets.enabled`.

## Limits and differences from Obsidian

- Nothing is imported from the clipboard or from HTML paste. The import is the command.
- Links are portable Markdown, not wikilinks, and do not use the vault graph.
- The assets folder is not created when a note opens or when diagnostics run.
