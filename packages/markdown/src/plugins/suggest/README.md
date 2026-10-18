# Suggestions

Completes note links, aliases, headings, block references and tags as you type,
corresponding to Obsidian's EditorSuggest lists.

## How it works

Links and Tags own trigger handlers on a typed bail event. The framework skips
literal code/frontmatter, requests ranked candidates over validated RPC, and
installs CodeMirror completion keys in the suggestion priority slot. The host
caches candidates by file, invalidates on index changes, materializes only 50
link texts and honors source feature switches. Accepting a link reuses closing
brackets. Aborted requests and plugin disposal cancel pending work.

Ranking is Obsidian 1.14's: the fuzzy score of `src/shared/fuzzy.ts` (checked
against Obsidian's own on 2,463 query and text pairs). A note matches on its
name, or on its path a point lower; an excluded note is still offered, 10
points lower. Aliases, headings and unresolved links match their own text; a
tag matches lower-cased, from every tag path in the vault (parents too),
listed by name. A block matches when its text has every word of the query,
or its id does, which ranks first. Equal scores keep the vault's order. With
nothing typed, notes come most recently changed first.

## Files

- `api.ts`: caller-owned source registration and trigger event.
- `manifest.ts`: default enablement and surfaces.
- `protocol.ts`: bounded query and result schemas.
- `sources.ts`: indexed candidate groups and per-file cache invalidation.
- `candidates.ts`: metadata candidate construction.
- `insertion.ts`: deferred wiki/Markdown insertion and destination encoding.
- `rank.ts`: Obsidian's scoring and bounded best-50 selection.
- `host.ts`: per-panel RPC and source enablement checks.
- `completion.ts`: code exclusion and insertion transaction.
- `webview.ts`: source service, asynchronous completion and key priority.
- `suggest.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Provides `suggest.register`; webview injects `editor` and `rpc`, host injects
`rpc`, `vault` and the host service `settings`. Emits the `suggest/trigger` bail event; Links and
Tags listen independently. `markdownWorkshop.plugins.suggest.enabled` defaults
to true. No palette commands or assigned verify shortcuts.

## Limits and differences from Obsidian

At most 50 results. Equal scores keep the vault's order, which is by path
here and the order the files were loaded in Obsidian, so exact ties can list
differently. First candidate construction can exceed a frame on large vaults;
warm queries reuse cached candidates. Existing indexed metadata can lag typing by the indexer's
refresh interval. Block completion uses explicit IDs already present in a note;
it does not create IDs for arbitrary paragraphs. The popup uses CodeMirror's UI.

With `links.useWikilinks` off, accepting a link/head/block completion replaces
the entire partial wiki token with a Markdown link. Existing `]]` are consumed.
Unresolved Markdown destinations follow normal Markdown-link opening; unlike
unresolved wikilinks, they do not create missing notes on click.
