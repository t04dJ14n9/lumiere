# Startup / first-open wave 5 (2026-10-22)

Stacked on wave 4 (`perf/startup-first-open-4` / PR #279). Target: cut cold
open of large notes (the large cold-open fixture) well under the
measured ~3.7 s Host GUI TTI toward Obsidian-feel / &lt;1.5 s first interactive
paint. REA Obsidian recovery remains out of scope.

## Strategy (public CM6 / viewport patterns)

1. **Prefix `documentTree` on create** — large notes parse only the opening
   band (`FIRST_PAINT_PARSE_CHARS` = `VIEWPORT_BLOCK_MARGIN * 2`, line-aligned)
   before first paint. Idle / double-rAF `documentTreeCompleter` dispatches
   `replaceDocumentTree` with a full `parseMarkdown` so footnotes / below-fold
   discovery catch up without blocking the first frame.
2. **`blockIndex` follows tree identity** — when the completer swaps the tree,
   the block index rebuilds so deferred/live widgets cover the rest of the note.
3. **First paint before paint-phase features** — bootstrap settles core plugins
   (document, dialect, editor, Live Preview chrome), marks `mw:plugins` /
   `mw:first-paint` on the first animation frame, **then** loads paint features
   and the deferred "all" set. Feature chunk download no longer gates the first
   interactive frame.
4. **Narrower paint feature set** — first screen keeps callouts, codeBlocks,
   lineNumbers, links, properties, smartLists, tables, tags, tasks. Editing
   helpers (autoPair, formatting, folding, footnotes, indentGuides, spellcheck)
   join the post-paint phase with math / mermaid / git / bridges.

## Measured on this box (Node, real note)

| Work | Before (wave 4) | After (wave 5) |
| --- | ---: | ---: |
| `parseMarkdown` full (the large cold-open fixture) | ~95–109 ms | (idle, after paint) |
| `parseForFirstPaint` / `documentTree` create | = full | **~0.6–2 ms** |

Host GUI `mw:first-paint` for the large fixture remains the judge; do not
hot-unpack into the shared integ extension while another hunt owns it. Prefer
the dedicated `test/vscode/perf.spec.ts` profile (`/tmp/markdown-workshop-e2e-*`)
or an intentional integ unpack + restore.

## Correctness

- Small notes (`doc.length ≤ budget`) still full-parse on create.
- Prefix trees reparse on edit until the completer expands them.
- Unit: `document-tree.test.ts`, updated `deferred-block.test.ts` (forces a
  completed tree before asserting live vs deferred counts).

## BH-018 (status bar + perceived blank)

Opening a new note tab left the previous note's word count on the status bar
for seconds while the webview booted (`panelCounts` awaited
`captureSelection` RPC). Wave 5 shows host/panel document counts immediately
(50 ms selection race) and also listens for `editor/opened` /
`editor/activeChanged` / `editor/ready`. Webview HTML uses the editor
background before `editor.js` paints so the tab is not a white void while
scripts load. Content TTI remains the prefix-tree + deferred-features work
above.
