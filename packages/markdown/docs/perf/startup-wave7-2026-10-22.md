# Startup / first-open wave 7 (2026-10-22)

Stacked on wave 6 after #284 merged to `main` (`804b45d8`; tip was `303acc87`).
Host GUI on that tip (the large cold-open fixture):

| Milestone | Time |
| --- | ---: |
| Tab / blank | ~0.2 s |
| Status + outline ready, editor blank | ~0.7 s |
| First glyphs | ~0.8 s |
| Live Preview interactive (Properties + heading + body) | ~1.4 s |

Properties still trailed glyphs by ~0.6 s (gap not closed vs #282’s ~0.5 s).
BH-018 PASS. Target: cut blank-before-glyphs and/or the Properties→interactive
gap toward Obsidian-feel / clearly under ~1 s interactive when feasible.

## Profile (what still gated TTI)

1. **Chrome configure waited on all paint chunks** — wave 6’s
   `preloadPaintFeatures()` fetched tables (~57 KB), callouts, codeBlocks,
   links, … and `scheduleFeaturePhases` awaited that promise *before*
   `configure(..., "chrome")`. Properties (~67 KB) was ready early but still
   queued behind tables download + parse.

## Strategy (kept)

1. **Split chrome vs paint-structure preload** — `preloadChromeFeatures()`
   loads only `properties` / `sourcesProperty` / `tags` / `lineNumbers`.
   `preloadPaintFeatures()` loads the remaining first-screen structure.
   After `mw:first-paint`, chrome configure waits on **chrome chunks only**;
   paint configure waits on the structure promise.

`sourcesPropertyHost` stays on the critical panel set (wave 6) so Sources
open RPC is ready with the sheet.

## Host GUI remasure of first tip (`ff9c7d16`) — REGRESSED

| Milestone | #284 | #285 first tip |
| --- | ---: | ---: |
| First glyphs | ~0.8 s | ~0.7 s |
| Live Preview interactive | **~1.4 s** | ~1.5 s |
| Properties gap after glyphs | ~0.6 s | ~0.8 s |

### Hypothesis

Two extras on that tip hurt interactive more than the chrome split helped:

1. **`#mw-boot` HTML skeleton** — embedding ~10 KB of escaped opening-band
   text made first “glyphs” look earlier (boot `<pre>`, not CM6), then
   removing `#mw-boot` and mounting `EditorView` thrashed layout on the same
   turn Properties chrome needed. Absolute Properties time moved ~1.4 s →
   ~1.5 s; the gap widened because glyphs moved earlier while chrome got
   slightly later.
2. **Deferring `sourcesPropertyHost` again** — wave 6 promoted it so open
   RPC is ready with the sheet. Putting it back on deferred did not recover
   interactive; keep wave 6’s critical placement.

### Fix (follow-up on this PR)

- **Revert** the boot skeleton (`webviewHTML` / `#mw-boot` / clear-on-mount)
  and the `sourcesPropertyHost` deferral.
- **Keep** the chrome vs paint-structure preload split only.

Coordinator Host GUI remasure on the new tip decides merge. Do not merge on
interactive > #284 (~1.4 s).

## Marks

`mw:main` → `mw:ready` → `mw:plugins` → `mw:first-paint` → `mw:properties`
→ `mw:features`. Host GUI cold-open remains the judge (integ pid left alone).

## Correctness

- Sources open RPC stays on the critical host set with the sheet.
- Unit: `webview-html.test.ts` (CSP), existing Sources / properties tests.
