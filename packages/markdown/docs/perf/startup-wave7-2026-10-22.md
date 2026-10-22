# Startup / first-open wave 7 (2026-10-22)

Stacked on wave 6 after #284 merged to `main` (`804b45d8`; tip was `303acc87`).
Host GUI on that tip (WorkVault `AI 活动平台上云.md` ~663 KB):

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
2. **`sourcesPropertyHost` on the critical panel set** — promoted in wave 6
   for open-RPC readiness, but `ready` awaits `owned.settled()`. The host half
   is only needed when the user clicks a Source; first paint uses webview
   markup alone. Critical settle delayed the ready payload → delayed CM6.
3. **Blank `#app` until `editor.js` parsed** — BH-018 painted the editor
   background, but no glyphs until the module booted and CM6 mounted (~0.8 s
   on Host GUI).

## Strategy

1. **Split chrome vs paint-structure preload** — `preloadChromeFeatures()`
   loads only `properties` / `sourcesProperty` / `tags` / `lineNumbers`.
   `preloadPaintFeatures()` loads the remaining first-screen structure.
   After `mw:first-paint`, chrome configure waits on **chrome chunks only**;
   paint configure waits on the structure promise.
2. **Defer `sourcesPropertyHost` again** until `editor/session-ready` (same
   as wave 2–5). Webview chrome phase still starts `sourcesProperty` for the
   sheet.
3. **HTML boot skeleton** — `webviewHTML` embeds a line-aligned prefix of
   `session.text` (`BOOT_TEXT_CHARS` = 10 000) in `#mw-boot` so the opening
   band paints while `editor.js` downloads. Cleared in the same turn
   `EditorView` mounts so glyphs do not drop out.

## Marks

`mw:main` → `mw:ready` → `mw:plugins` → `mw:first-paint` → `mw:properties`
→ `mw:features`. Host GUI cold-open remains the judge (integ pid left alone).

## Correctness

- Sources open RPC still works once the deferred host starts (session-ready).
- Boot text is HTML-escaped; large notes only ship the opening band in the
  initial document.
- Unit: `webview-html.test.ts` (boot escape + embed), existing Sources /
  properties tests.
