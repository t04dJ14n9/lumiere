# Scratch

Creates temporary notes outside the wiki bundle. A note becomes a wiki page only when you run Promote Scratch Note. Nothing is ingested on its own.

## How it works

New Scratch Note asks for a title and writes `YYYY-MM-DD-title.md` in the layout's `scratch` path, or in `markdownWorkshop.scratch.folder` when no layout loaded. The folder is created then. The note has `title` and `captured`, and no `type`. A scratch folder inside the bundle is refused. Promote Scratch Note asks for Concept, Source Summary, Entity or Raw Source, writes that page (fixed H2 sections, `generated.by: human:workbench`) and replaces the scratch note with a portable link. Collection `index.md` is left alone. A Marp deck is not promoted and is not wrapped.

## Files

- `host.ts`: the two commands.
- `run.ts`: create and promote, including symlink checks.
- `template.ts`: scratch text, page text, stub and refusals.
- `names.ts`: file names.
- `manifest.ts`: commands and `scratch.folder`.

## Services, events and settings

- Requires `workbench`. Optionally uses `editors` and `wikiLayout`.
- Does not provide a service.
- Setting: `markdownWorkshop.scratch.folder` (default `scratch`; a loaded layout wins).
- Setting: `markdownWorkshop.plugins.scratch.enabled`.

## Limits and differences from Obsidian

- There is no daily note and no automatic filing.
- Promotion does not update indexes, backlinks or the Obsidian graph.
- Untitled notes must be saved into the project before they can be promoted.
- Marp decks stay where they are. Move a deck outside the bundle from the Marp commands.
