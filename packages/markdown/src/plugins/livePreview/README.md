# Live Preview

Renders Markdown in place and reveals syntax around the caret, like Obsidian's
Live Preview. Each panel can switch between Live Preview and Source mode.

## How it works

A shared document tree feeds block indexes and viewport inline decorations.
Feature renderers are selected in catalog rank order; generic core blocks use
the base slot. Caller-bound registrations retain the contributing plugin's owner.
Built-in block renderers declare their eligible node names. Structural syntax
is discovered once per tree and reused across registrations; unrelated inline
syntax and match predicates are skipped. Undeclared or inline node renderers
retain complete discovery.
The engine compartment switches presentation without replacing the document.
Inline decorations map through IME and selection-only mouse drag updates.
Viewport changes during a drag or scrollbar press render newly visible text using
the frozen reveal selection; rendered clicks map visible text back to source
before syntax is revealed.
A coloured highlight (`==🔵text==`, Obsidian 1.14) shows in its colour with
the emoji hidden, or a swatch in its place while the caret is in it, as
Obsidian shows it.
Emphasis around a highlight remains parsed inside a word, including its colour
emoji, so moving the caret outside hides both pairs of syntax markers. The
syntax parser and HTML renderer share the highlight-aware emphasis flanking rule.

## Files

- `manifest.ts`: core metadata and Toggle Source command.
- `api.ts`: renderer, inline context and service contracts.
- `host.ts`: native Toggle Source command routing.
- `webview.ts`: engine/service, invalidation, fallback and mode registrations.
- `registry.ts`: renderer facets and reveal rules.
- `document-tree.ts`: incremental document syntax tree.
- `blocks.ts`: block index, widget decorations and render revision.
- `block-discovery.ts`: structural syntax cache and renderer candidate selection.
- `block-discovery.test.ts`: registration cost, discovery parity and unrestricted renderers.
- `inline.ts`: basic inline decoration builder and composition/drag lifetime.
- `highlight-colour.ts`: a coloured highlight's class and emoji.
- `../../markdown/dialect/highlight-emphasis.ts`: highlight-aware emphasis flanking,
  shared with the HTML renderer.
- `code-lines.ts`: code block lines; only fence text hides, so reveals never
  change the layout. Thematic breaks are likewise one decorated line.
- `rendered-position.ts`: visible-text projection and DOM-to-source mapping.
- `motion.ts`: Escape and vertical motion around rendered blocks, visible-widget queries and disjoint fold spans.
- `core.test.ts`: reveal, motion, mode and lifecycle unit coverage.
- `inline.test.ts`: basic/custom decoration and line-deduplication units.
- `../../../test/unit/livePreview/nested-formatting.test.ts`: formatting commands
  followed by caret-outside syntax hiding.
- `inline-viewport.test.ts`: scrollbar and drag viewport rendering, frozen reveal,
  selection-only stability and composition mapping units.
- `code-lines.test.ts`: code and thematic break line classes and hidden text.
- `invalidation.test.ts`: incremental index and decorations equal a full rebuild (randomised); invalidation reasons.
- `decoration-cost.test.ts`: renderer matches and widgets built per caret move and edit on a 4,000-block note.

## Incremental invalidation

Each transaction yields `RenderInvalidation`s (`invalidation.ts`):
`{ fromLine, toLine, reason }` with reason `text` (the lines whose blocks a
text change may have altered: every top-level syntax node, before or after
the change, that touches it or the region found so far, widened to whole
lines until stable), `selection` (lines the caret left or
entered) or `metadata` (an effect, a reconfiguration or a renderer change:
every line).

- `blockIndex` indexes only the `text` region again. Blocks before it are
  kept as the same objects; blocks after it are shifted copies. A region over
  half the note, or a block found there that reaches outside it, falls back
  to a full index.
- Below-fold blocks use `DeferredBlockWidget` until `blockHotRanges`
  (viewport + margin, plus the caret) covers them; see
  `docs/perf/startup-viewport-2026-10-22.md`.
- `blockDecorations` rebuilds decorations only for blocks that are new to
  the index or touched by an invalidation, found by binary search;
  `metadata` (or more than half the blocks dirty) rebuilds all. A caret move
  costs O(log blocks + blocks it enters or leaves).
- Costs that remain document-wide (measured with
  `scripts/measure-decorations.ts`; `decoration-cost.test.ts` pins the
  counts): an edit still rebuilds the widgets of every block after it
  (widgets carry source positions; their DOM is kept because the source did
  not change), and `blockIndex` maps the positions of every block after it.
  On a 16,000-block note (372 KB, a loaded machine) an edit at the start
  costs about 10 ms more than the syntax tree's own ~11 ms; at the end, about
  1 ms more; a caret move about 0.05 ms (was 2.8 ms).
- Renderers' `match` and `range` may read only the node and the text around
  it; anything else they depend on must reach them as a facet change or an
  effect. `invalidation.test.ts` checks, over thousands of random edits and
  caret moves, that the incremental index and decorations equal a full
  rebuild. A renderer's optional `nodes` list must name every syntax node
  its `match` can accept; omitting it retains the complete traversal.

## Services, events and settings

Webview injects `editor`, `commands` and `render`; host injects the host service `hostCommands` and
`editors`. Provides `livePreview`. Listens to
`render/changed` and `editor/modeRestored`; emits no kernel events. Initial mode
comes from `editor.defaultMode`; Toggle Source changes only the active panel.
Renderer registrations belong to their caller and dispose with that caller.

## Limits and differences from Obsidian

Source mode retains the inline title (when it is on). A block covering the whole document has no
outside destination for Escape. Rendered-position mapping refuses mismatched DOM
text such as embedded media/math. VS Code owns text/undo; exact visual parity is
left to the owner's manual comparison.

The `visiblePosition` service query places external badges after replacement
blocks without exposing renderer internals to marker providers.

### Reveal rules

Follows the measured [Obsidian rules](../../../docs/OBSIDIAN_REVEAL_RULES.md).
Any selection touching an inline element (inclusive endpoints) reveals its
outermost ancestor and the transitive chain of directly abutting elements;
one character or space breaks the chain. Escapes and heading/quote marks reveal
on selected lines. Tasks reveal only through the checkbox end (columns 0–5
for `- [ ]`). Both code fences reveal anywhere in the block. Callouts reveal
source with quote marks per line and inline syntax per element. Definition
markers reveal on their first line; math and HTML blocks reveal whole, and
display math keeps its rendered formula below the source. Styled inline HTML (`kbd`, `mark`, `span`, …) hides both tags and paints the content even when the opener carries attributes (`<kbd class="…">`); self-closing and block tags stay source. A click on a
rendered math block reveals it as in Obsidian, selecting the formula. Callout
title/body clicks and Edit select the whole source; their fold buttons toggle disclosure.
A click on a drawn horizontal rule selects its source (head at start) via the
same `selectRenderedSource` handoff so typing replaces the rule.
Rendered fenced code (diagrams,
queries, processed code) only from its Edit button, selecting the code
(`BlockEditing` in `src/webview/ui/markdown-widget.ts`).
Tables and Properties retain their widgets; bullets, numbers, tags and comment
markers stay visible. Footnote references deliberately retain superscript
rendering except when a caret touches the reference itself.

`reveal-rules.test.ts` documents the inline and line rules as caret-offset tables;
`test/unit/livePreview/reveal-plugins.test.ts` checks feature renderer composition.
