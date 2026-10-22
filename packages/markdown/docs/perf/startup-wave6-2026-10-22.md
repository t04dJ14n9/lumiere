# Startup / first-open wave 6 (2026-10-22)

Stacked on wave 5 (`perf/startup-first-open-5` / PR #282 tip `11b8895c`).
Host GUI on that tip: first glyphs ~1.3 s; Live Preview interactive
(Properties + heading + body) ~1.8 s. Gap: the Properties frame trails
first glyphs by ~0.5 s. Target: close that gap toward &lt;1.5 s interactive /
Obsidian-feel. REA Obsidian recovery remains out of scope.

## Profile (why Properties trailed glyphs)

Wave 5 marks `mw:first-paint` after core Live Preview settles and **before**
paint-phase feature chunks. Body glyphs can appear from MarkdownBlocks while
the Properties widget waits on:

1. **Dynamic import of `properties` (~68 KB webview chunk)** started only
   inside the post-rAF paint phase, racing tables (~57 KB), callouts, etc.
2. **`sourcesProperty` deferred to the post-paint "all" phase** (and its host
   half deferred until `editor/session-ready`), so large fixture notes first paint
   Sources as Unknown JSON (~29 KB row) then remount the typed stack.
3. **Collapsed Sources still emitted every hidden article** (~108 rows in
   the large fixture) into the DOM for "Showing N of M" unhide — large HTML + bind
   cost on first interactive frame.
4. **`PropertyWidget` ran `renderProperties` twice** on create (`estimatedHeight`
   then `toDOM`) — ~15–30 ms each for that note's frontmatter.

## Strategy

1. **Preload paint chunks during `root.settled()`** — `preloadPaintFeatures()`
   starts the dynamic imports while core plugins finish so Properties is
   cached before the first-paint rAF configures them.
2. **Chrome-first feature phase** — new `phase: "chrome"` starts
   `properties`, `sourcesProperty`, `tags`, `lineNumbers` and marks
   `mw:properties` before the rest of paint (tables, callouts, codeBlocks,
   links, smartLists, tasks). Glyphs stay early; Properties no longer waits
   on the tables chunk.
3. **Promote Sources onto the critical path** — `sourcesProperty` joins the
   webview paint/chrome set; `sourcesPropertyHost` moves from deferred panel
   hosts to critical so open RPC is ready with the sheet.
4. **Preview-only Sources markup** — collapsed sheets emit only the preview
   window; "Showing N of M" remounts with `expanded: true` (same height-map
   contract via `onExpand` → `render/changed`). Cold open skips ~100 hidden
   articles.
5. **One `renderProperties` per widget** — cache sheet markup for
   `estimatedHeight` + `toDOM` (`propertiesHeightFromMarkup`).

## Measured on this box (Node, large-fixture note frontmatter)

| Work | Wave 5 | Wave 6 |
| --- | ---: | ---: |
| `renderProperties` without Sources renderer | ~31 ms / 44 KB HTML | same path unused when Sources is chrome |
| `renderProperties` + Sources preview (3 of 108) | ~20 ms / **68 KB** (all rows hidden-in-DOM) | **preview-only rows** (no hidden extras) |
| `PropertyWidget` create parse count | 2× `renderProperties` | **1×** |

Host GUI cold-open TTI is not re-measured here (integ extension left alone;
pid left running). Prefer intentional hot-unpack of a packaged tip, or
`test/vscode/perf.spec.ts`. Marks: `mw:first-paint` → `mw:properties` →
`mw:features`.

## Correctness

- Expanding Sources still remounts the full stack and `requestMeasure`s.
- Small notes / no-frontmatter paths unchanged (chrome phase is a no-op when
  features are disabled).
- Unit: `sourcesProperty/markup.test.ts` (preview-only), existing height and
  bind tests.

