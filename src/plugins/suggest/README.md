# Suggestions

Completes note links, aliases, headings, block references and tags as you type,
corresponding to Obsidian's EditorSuggest lists.

## How it works

Links and Tags own trigger handlers on a typed bail event. The framework skips
literal code/frontmatter, requests ranked candidates over validated RPC, and
installs CodeMirror completion keys in the suggestion priority slot. The host
queries existing vault metadata, omits excluded files and honors source feature
switches. Accepting a link reuses closing brackets. Aborted requests and plugin
disposal cancel pending work.

## Files

- `api.ts`: caller-owned source registration and trigger event.
- `manifest.ts`: default enablement and surfaces.
- `protocol.ts`: bounded query and result schemas.
- `sources.ts`: indexed candidates and fuzzy ranking.
- `host.ts`: per-panel RPC and source enablement checks.
- `completion.ts`: code exclusion and insertion transaction.
- `webview.ts`: source service, asynchronous completion and key priority.

## Services, events and settings

Provides `suggest.register`; webview injects `editor` and `rpc`, host injects
`rpc`, `vault` and `workbench`. Emits the `suggest/trigger` bail event; Links and
Tags listen independently. `markdownWorkbench.plugins.suggest.enabled` defaults
to true. No palette commands or assigned verify shortcuts.

## Limits and differences from Obsidian

At most 50 results; existing indexed metadata can lag typing by the indexer's
refresh interval. Block completion uses explicit IDs already present in a note;
it does not create IDs for arbitrary paragraphs. The popup uses CodeMirror's UI.
