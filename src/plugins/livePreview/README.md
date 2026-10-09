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
Inline decorations map through IME and mouse drags, then rebuild; rendered clicks
map visible text back to source before syntax is revealed.

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
- `code-lines.ts`: code block lines; only fence text hides, so reveals never
  change the layout. Thematic breaks are likewise one decorated line.
- `rendered-position.ts`: visible-text projection and DOM-to-source mapping.
- `motion.ts`: Escape and vertical motion around rendered blocks.
- `core.test.ts`: reveal, motion, mode and lifecycle unit coverage.
- `inline.test.ts`: basic/custom decoration and line-deduplication units.
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

Webview injects `editor`, `commands` and `render`; host injects `workbench` and
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
