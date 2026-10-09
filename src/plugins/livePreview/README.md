# Live Preview

Renders Markdown in place and reveals syntax around the caret, like Obsidian's
Live Preview. Each panel can switch between Live Preview and Source mode.

## How it works

A shared document tree feeds block indexes and viewport inline decorations.
Feature renderers are selected in catalog rank order; generic core blocks use
the base slot. Caller-bound registrations retain the contributing plugin's owner.
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
- `inline.ts`: basic inline decoration builder and composition/drag lifetime.
- `code-lines.ts`: code block lines; only fence text hides, so reveals never
  change the layout. Thematic breaks are likewise one decorated line.
- `rendered-position.ts`: visible-text projection and DOM-to-source mapping.
- `motion.ts`: Escape and vertical motion around rendered blocks.
- `core.test.ts`: reveal, motion, mode and lifecycle unit coverage.
- `inline.test.ts`: basic/custom decoration and line-deduplication units.
- `code-lines.test.ts`: code and thematic break line classes and hidden text.
- `invalidation.test.ts`: incremental index and decorations equal a full rebuild (randomised); invalidation reasons.

## Incremental invalidation

Each transaction yields `RenderInvalidation`s (`invalidation.ts`):
`{ fromLine, toLine, reason }` with reason `text` (the lines whose blocks a
text change may have altered: every top-level syntax node it touched, before
and after, widened to whole lines), `selection` (lines the caret left or
entered) or `metadata` (an effect, a reconfiguration or a renderer change:
every line).

- `blockIndex` indexes only the `text` region again. Blocks before it are
  kept as the same objects; blocks after it are shifted copies. A region over
  half the note, or a block found there that reaches outside it, falls back
  to a full index.
- `blockDecorations` rebuilds decorations only for blocks that are new to
  the index or touched by an invalidation; `metadata` (or more than half the
  blocks dirty) rebuilds all. Blocks after an edit get new widgets with
  their new positions (widgets carry positions), but keep their DOM because
  the source did not change.
- Renderers' `match` and `range` may read only the node and the text around
  it; anything else they depend on must reach them as a facet change or an
  effect. `invalidation.test.ts` checks, over thousands of random edits and
  caret moves, that the incremental index and decorations equal a full
  rebuild.

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
