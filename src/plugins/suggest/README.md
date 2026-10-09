# Suggestions

Completes note links, aliases, headings, block references and tags as you type,
corresponding to Obsidian's EditorSuggest lists.

## How it works

Links and Tags own trigger handlers on a typed bail event. The framework skips
literal code/frontmatter, requests ranked candidates over validated RPC, and
installs CodeMirror completion keys in the suggestion priority slot. The host
caches candidates and prepared ranking text by file, invalidates on index
changes, materializes only 50 link texts, omits excluded files and honors source feature
switches. Accepting a link reuses closing brackets. Aborted requests and plugin
disposal cancel pending work.

## Files

- `api.ts`: caller-owned source registration and trigger event.
- `manifest.ts`: default enablement and surfaces.
- `protocol.ts`: bounded query and result schemas.
- `sources.ts`: indexed candidate groups and per-file cache invalidation.
- `candidates.ts`: metadata candidate construction.
- `insertion.ts`: deferred wiki/Markdown insertion and destination encoding.
- `rank.ts`: prepared scoring and bounded best-50 selection.
- `host.ts`: per-panel RPC and source enablement checks.
- `completion.ts`: code exclusion and insertion transaction.
- `webview.ts`: source service, asynchronous completion and key priority.
- `suggest.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Provides `suggest.register`; webview injects `editor` and `rpc`, host injects
`rpc`, `vault` and `workbench`. Emits the `suggest/trigger` bail event; Links and
Tags listen independently. `markdownWorkbench.plugins.suggest.enabled` defaults
to true. No palette commands or assigned verify shortcuts.

## Limits and differences from Obsidian

At most 50 results; exact score/label ties use canonical paths for deterministic
ordering. First candidate construction can exceed a frame on large vaults; warm
queries reuse prepared data. Existing indexed metadata can lag typing by the indexer's
refresh interval. Block completion uses explicit IDs already present in a note;
it does not create IDs for arbitrary paragraphs. The popup uses CodeMirror's UI.

With `links.useWikilinks` off, accepting a link/head/block completion replaces
the entire partial wiki token with a Markdown link. Existing `]]` are consumed.
Unresolved Markdown destinations follow normal Markdown-link opening; unlike
unresolved wikilinks, they do not create missing notes on click.
