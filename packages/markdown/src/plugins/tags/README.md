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

What counts as a tag is Obsidian 1.14.4's rule, measured over every BMP
character (`src/markdown/tags/grammar.ts` and `markup.ts`), and Live Preview,
the index and rendered HTML share it. A tag is `#` and a run of tag characters
that is not only ASCII digits. Whitespace, ASCII punctuation other than `-`,
`/` and `_`, and the General and Supplemental Punctuation blocks (`–`, `“`,
`…`) end a tag; CJK and full-width punctuation, `·`, symbols and emoji do not.
A tag starts only at the start of a block's text, after whitespace, right
after another tag (`#a#b`), or right after inline markup: paired emphasis,
highlight or strikethrough (`**#a**`), a closed `[…]` (`[#a]`), or the end of
a code span, math, comment, HTML tag, link or escape. Any other character
before `#` means no tag: `(#a)`, `中#a`, `，#a`, `!!#a`. Frontmatter `tags`
values are trimmed, lose one leading `#`, and must then be a whole tag.

Typing a tag offers the vault's tags where Obsidian's list opens (measured):
for a `#` at the start of a line or after whitespace, with tag characters up
to the caret and no `#` right after it (`suggestions.ts`). Unlike a tag, the
list does not open after markup or another tag (`**#a`, `#a#b`), and it opens
for digits alone (`#12`).

The Tags view is a window-level half (`view.ts`), because a view outlives any
one editor panel. It takes the active note's vault, or the workspace's when no
note is open, and builds the tree with the ported tag tree
(`src/markdown/tags/tree.ts`) from indexed metadata (`tree.ts`). Tags that
differ only in case are one entry, spelled as first seen. Counts are notes: a
parent counts a note once however many of its descendants the note uses.
Excluded files are left out, as in search. The view rebuilds 300 ms after the
vault re-resolves, the active note changes or settings change, and only while
it is visible. Both halves follow `lumiere.markdown.plugins.tags.enabled`. The Explorer view is limited to `activeCustomEditorId == 'lumiere.markdown.editor'` so Tags hide when another editor is active; Outline's enter/leave focus also reveals Tags while Workshop is active.

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
- `../../../test/unit/tags/suggestions.test.ts`: where the tag list opens, as
  measured in Obsidian.
- `tags.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Webview injects `editor`, `livePreview` and `rpc`; the panel host injects `rpc`,
`vault` and the host services `hostCommands`, `dialogs`, `views`, `activeEditor`, `settings` and `navigation`; the view injects the host services `hostCommands`, `dialogs`, `views`, `activeEditor`, `settings` and `navigation`, plus `vaults`. Provides no
services. The webview listens to `render/postProcess`, and to `suggest/trigger`
for its own completion syntax; the view listens to `vault/resolved`. Emits no
kernel events. Settings: `lumiere.markdown.plugins.tags.enabled` (true),
`lumiere.markdown.tags.viewSort` (`frequency` or `name`, default `frequency`) and
`lumiere.markdown.tags.viewNested` (true). No palette command or keybinding;
the view registers the internal `lumiere.markdown.tags.search` command for
its clicks.

## Limits and differences from Obsidian

Uses a native quick pick for search results, not a search pane. Sorting and
nesting are settings rather than buttons in the view. Search and the view
reflect currently indexed metadata; hidden and excluded files follow the
vault's policy. Full visual interaction parity remains for owner comparison.

The markup a tag may follow is read from the text around the `#`, not from
the syntax tree, so it can differ where the block structure does: a lone `*`
on the next line closes `*#a` here, not in Obsidian. Inline footnotes
(`^[#a]`) are indexed like Obsidian. Tag suggestions also open inside
fenced/inline code and source-mode frontmatter, as in Obsidian 1.14.4; link
suggestions stay blocked there.
