# Tags

Renders clickable tags and finds notes containing a tag or its descendants,
corresponding to Obsidian's inline tags and tag search.

## How it works

An inline renderer replaces unrevealed tags with buttons; a post-processor binds
tags inside rendered blocks and embeds. A delegated listener also handles shared
tag placeholders in reconciled property widgets. A validated RPC request
queries existing vault metadata, including YAML and footnote tags, then opens a
native quick pick. Matching is case-insensitive and hierarchical; excluded files
are omitted. No per-request filesystem scan or note read occurs.

## Files

- `suggestions.ts`: plugin-owned completion trigger through `suggest/trigger`.

- `manifest.ts`: default enablement and host/webview declarations.
- `protocol.ts`: grammar-validated tag search request.
- `widget.ts`: inline button, callback identity and cleanup.
- `webview.ts`: renderer, rendered-button lifetime and theme.
- `search.ts`: metadata filtering and quick-pick query ranking.
- `host.ts`: RPC, native picker and contained note opening.
- `../../../test/unit/tags/search.test.ts`: indexed search and host lifecycle units.

## Services, events and settings

Listens to `suggest/trigger` for its own completion syntax.

Webview injects `editor`, `livePreview` and `rpc`; host injects `rpc`, `vault` and
`workbench`. Provides no services. Listens to `render/postProcess`; emits no
kernel events. `markdownWorkbench.plugins.tags.enabled` defaults to true. No
palette command or keybinding.

## Limits and differences from Obsidian

Uses a native quick pick for search results. This editor half does not define
an Explorer Tags view. Search reflects currently indexed metadata; hidden and
excluded files follow the vault's policy. Full visual interaction parity remains
for owner comparison.
