# Large-note first paint — viewport / deferred blocks (2026-10-22)

Stacked on wave 3 (`perf/startup-first-open-3` @ `2da8a444` / PR #278).
This wave is **not** more bundle shaving: it defers Live Preview *work* for
source that is not on screen yet.

## Strategy (public CM6 patterns)

1. **Hot band** — `blockHotRanges` starts as the opening ~10 KB of the note
   (`VIEWPORT_BLOCK_MARGIN * 2`). A small `ViewPlugin` updates it from
   `view.visibleRanges` (+ 5 KB margin) after scroll/doc changes
   (`queueMicrotask` so we never dispatch inside `update`).
2. **Live vs deferred widgets** — blocks intersecting the hot band ∪ the
   caret (±64) mount real feature widgets (tables, math, Mermaid, embeds,
   callouts, fenced HTML, …). Every other block mounts a
   `DeferredBlockWidget`: same replace decoration + `estimatedHeight` /
   minHeight, **no** `render.into` / Mermaid / MathJax / embed fetch.
3. **Idle render start** — when a live `MarkdownBlock` does mount, its shell
   paints immediately; `render.into` waits for `requestIdleCallback`
   (timeout 120 ms) or a double `rAF`, so a wide draw margin mounting many
   near-viewport blocks does not stall the first frame.
4. **Inline path unchanged** — hybrid inline decorations were already
   viewport-scoped; tall `|WxH` embeds stay `persistent` for the height map.

Height estimates for deferred shells reuse the existing tables / embeds /
MarkdownBlock estimators so PageDown / scroll stay close to the eventual
paint (same family of reserves as remount-height work).

## What you should feel

On the large cold-open fixture, first paint should
build real widgets only for the opening screen (+ margin). Scrolling near a
deferred region swaps shells for live widgets; briefly you may see an empty
reserved box before Mermaid/math/embed HTML finishes (same as today’s async
paint, but without paying for below-fold work up front).

## Measured (box, `measure-decorations.ts` 4000 blocks)

Feature widgets constructed per transaction (median of 21) vs wave 3 tip:

| Case | Wave 3 widgets | Wave 4 widgets |
| --- | ---: | ---: |
| edit first | 3000 | **323** |
| edit middle | 1498 | **1** |
| caret anywhere | 1 | 1 |

Opening-band live widgets replace the old full-document widget build; deferred
shells are not counted as feature widgets.

## Residual risks

| Risk | Mitigation |
| --- | --- |
| Blank flash in a deferred shell | minHeight from estimators; idle render starts within ~120 ms once live |
| Height jump when deferred → live | estimators match live widgets; ResizeObserver still remembers painted height |
| Caret jump / outline to below-fold | selection is always unioned into the live band so reveal still works |
| BH-014 rename / frontmatter links | host metadata path untouched |

SSH / Host GUI `mw:first-paint` remains the real TTI judge; harness
`profile-open.ts` still uses a monolithic fake host.

## Correctness

- Obsidian parity for **visible** content: same widgets once in the hot band.
- `pnpm check` green; unit test pins deferred vs live split on a long table note.
