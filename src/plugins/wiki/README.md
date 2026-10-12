# Wiki

Reads a project's `.wiki/layout.json` and `.wiki/registry.json`, shows problems for pages inside the bundle, and copies a selection for an agent. This is the workbench side of an llm-wiki project. It does not run an agent.

## How it works

Each workspace folder is read on its own. A missing layout is the legacy preset (bundle `knowledge` unless `.wiki/manifest.json` names another safe bundle) and does not invent collection folders. A layout that fails to parse is reported and is not treated as legacy. Copy Wiki Reference for Agent asks the Bridge plugin for the selection, adds the preset, bundle, collection and page type, and copies the LLM Wiki `@path#lines` text. Copy Wiki Bridge Envelope copies the JSON envelope instead. Neither command starts an agent. Saving or editing schedules another read; folders are not created.

## Files

- `host.ts`: commands, refresh, and the `wikiLayout` service.
- `session.ts`: load every workspace folder and publish diagnostics.
- `layout.ts`: parse layout, manifest bundle and registry.
- `load.ts`: missing layout versus a broken layout.
- `place.ts`: bundle membership, `$logical` collection and reserved pages.
- `diagnose.ts`: page contract, Marp-in-bundle and wikilinks.
- `lookup.ts`, `notes.ts`, `context.ts`, `copy.ts`, `summary.ts`: place, open notes, envelope context, clipboard and the layout message.
- `api.ts`: the service other plugins may inject.
- `manifest.ts`: commands.

## Services, events and settings

- Requires `workbench`. Optionally uses `editors` and `bridgeCapture`.
- Provides `wikiLayout`.
- Listens to document changes, saves and the active note.
- Diagnostics owner `wiki`.
- Setting: `markdownWorkbench.plugins.wiki.enabled`.

## Limits and differences from Obsidian

- Wikilinks are reported, not rewritten. Portable Markdown links are the wiki form.
- This plugin does not scaffold a vault, write `index.md`, ingest `inbox/`, or follow the Obsidian graph.
- A Marp deck inside the bundle without `type` and `generated` provenance is an error. The editor does not add that frontmatter.
- Copy needs the note open in Markdown Workbench. A dirty or untitled note has an envelope but no `@path` clipboard text until it is saved.
