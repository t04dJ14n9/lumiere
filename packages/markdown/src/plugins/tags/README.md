# Tags

Renders clickable tags and finds notes containing a tag or its descendants,
corresponding to Obsidian's inline tags and tag search. The Explorer's **Tags**
view lists every tag in the vault, nested by `/`, like Obsidian's Tags view;
clicking a tag runs the same search.

## How it works

An inline renderer replaces unrevealed tags with buttons; a post-processor binds
tags inside rendered blocks and embeds. A delegated listener also handles shared
tag placeholders in reconciled property widgets. A validated RPC request
queries existing vault metadata, including YAML and footnote tags, then opens a
native quick pick. Matching is case-insensitive and hierarchical; excluded files
are omitted. No per-request filesystem scan or note read occurs.

The Tags view is a window-level half (`view.ts`), because a view outlives any
one editor panel. It takes the active note's vault, or the workspace's when no
note is open, and builds the tree with the ported tag tree
(`src/markdown/tags/tree.ts`) from indexed metadata (`tree.ts`). Tags that
differ only in case are one entry, spelled as first seen. Counts are notes: a
parent counts a note once however many of its descendants the note uses.
Excluded files are left out, as in search. The view rebuilds 300 ms after the
vault re-resolves, the active note changes or settings change, and only while
it is visible. Both halves follow `markdownWorkshop.plugins.tags.enabled`. The Explorer view is limited to `activeCustomEditorId == 'markdownWorkshop.editor'` so Tags hide when another editor is active; Outline's enter/leave focus also reveals Tags while Workshop is active.

## Files

- `manifest.ts`: default enablement and host/webview declarations.
- `protocol.ts`: grammar-validated tag search request.
- `widget.ts`: inline button, callback identity and cleanup.
- `webview.ts`: renderer, and rendered-button lifetime.
- `search.ts`: metadata filtering and quick-pick query ranking.
- `suggestions.ts`: plugin-owned completion trigger through `suggest/trigger`.
- `host.ts`: RPC, native picker and contained note opening (per panel).
- `tree.ts`: the Tags view's tree source over the ported tag tree.
- `view.ts`: the Tags view's window plugin, refresh and click-to-search command.
- `../../../test/unit/tags/search.test.ts`: indexed search and host lifecycle units.
- `../../../test/unit/tags/view.test.ts`: note counts, case merging, flat and
  frequency modes, excluded files, click-to-open and the enabled setting.
- `tags.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Webview injects `editor`, `livePreview` and `rpc`; the panel host injects `rpc`,
`vault` and `workbench`; the view injects `workbench` and `vaults`. Provides no
services. The webview listens to `render/postProcess`, and to `suggest/trigger`
for its own completion syntax; the view listens to `vault/resolved`. Emits no
kernel events. Settings: `markdownWorkshop.plugins.tags.enabled` (true),
`markdownWorkshop.tags.viewSort` (`name` or `frequency`, default `name`) and
`markdownWorkshop.tags.viewNested` (true). No palette command or keybinding;
the view registers the internal `markdownWorkshop.tags.search` command for
its clicks.

## Limits and differences from Obsidian

Uses a native quick pick for search results, not a search pane. Sorting and
nesting are settings rather than buttons in the view. Search and the view
reflect currently indexed metadata; hidden and excluded files follow the
vault's policy. Full visual interaction parity remains for owner comparison.
