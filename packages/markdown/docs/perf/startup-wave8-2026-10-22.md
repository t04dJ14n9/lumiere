# Startup / first-open wave 8 (2026-10-22)

Stacked on wave 7 tip `57e3a713` (PR #285; Host GUI remasure: glyphs ~0.6 s,
Live Preview interactive ~1.0 s, Properties gap ~0.4 s). Target: cut further
toward Obsidian-feel — interactive clearly under ~0.7–0.8 s, or glyphs sooner
**without** regressing interactive. No HTML boot skeleton (that inflated
“glyph” times without CM6 and regressed interactive once on #285).

## Profile (what still gated TTI after #285)

1. **Chrome configure waited on first-paint rAF** — wave 7 started Properties
   only inside the `requestAnimationFrame` that marks `mw:first-paint`. Even
   when chrome chunks were already fetched during `root.settled()`, Properties
   trailed body glyphs by that frame plus configure cost (~0.4 s gap on Host
   GUI).
2. **Properties chunk fetch started only after `editor.js` ran** —
   `preloadChromeFeatures()` cannot begin until the entry evaluates. On cold
   open, `editor.js` download/parse and the Properties/Sources graph were
   serial.
3. **`cursorBridgePanelHost` on the critical panel set** — Edit/Chat handoff
   is not needed for Properties+heading+body interactive; it still ran before
   the ready handshake returned text.

## Strategy

1. **`webview/chrome.js` entry + `<link rel="modulepreload">`** — new
   `src/webview/chrome.ts` statically imports properties / sourcesProperty /
   tags / lineNumbers. HTML modulepreloads `editor.js` and `chrome.js` in
   `<head>` so the Properties graph (~728 KB production, shared chunks with
   the dynamic feature loaders) fetches while the entry downloads and parses.
   Fetch-only: chrome.js is not evaluated as a boot skeleton.
2. **Chrome configure without waiting for first-paint rAF** — after
   `root.settled()`, Properties configure runs as soon as chrome chunks
   resolve; `mw:first-paint` still marks on rAF from core Live Preview. Paint
   structure and deferred features still follow `mw:properties`.
3. **Defer `cursorBridgePanelHost`** until `editor/session-ready` with the
   other non-critical panel hosts.

## Bundle (production, this box)

| Asset | Size |
| --- | ---: |
| `editor.js` | ~116 KB |
| `chrome.js` (preload entry) | ~0.8 KB |
| `chrome.js` + static shared chunks | ~728 KB |

Shared chunks match the dynamic `webview-*.js` stubs used by
`preloadChromeFeatures()` (verified overlap), so modulepreload warms the same
URLs bootstrap will import.

## Host GUI

Not remasured here (integ pid left alone; no 0.0.0 clobber). Coordinator
cold-opens WorkVault `AI 活动平台上云.md` on this tip and judges glyphs /
interactive / Properties gap vs #285 (~0.6 s / ~1.0 s / ~0.4 s).

## Marks

`mw:main` → `mw:ready` → `mw:plugins` → `mw:first-paint` (rAF) and
`mw:properties` (chrome configure; may precede or follow first-paint) →
`mw:features`.

## Correctness

- No `#mw-boot` / escaped body skeleton.
- Sources open RPC stays on the critical host set with the sheet.
- Unit: `webview-html.test.ts` (CSP + modulepreload links).
