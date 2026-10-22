# Startup / first-open wave 9 (2026-10-22)

Stacked on #285 / `main` tip `be30d581` (Host GUI: glyphs ~0.6 s, Live
Preview interactive ~1.0 s, Properties gap ~0.4 s). Target: cut interactive
further under ~1.0 s toward Obsidian-feel / ~0.7–0.8 s.

**Do not revive #286** (`modulepreload` of `webview/chrome.js` + earlier
Properties). That path regressed interactive ~1.0 s → ~1.3 s on the WorkVault
note. No HTML boot skeleton either (regressed once on #285).

## Profile (remaining critical path after #285)

| Stage | What we measured / observed |
| --- | --- |
| `editor.js` static closure | **~869 KB** on #285 — including CM6 view (~226 KB), markdown-it (~112 KB), and **`yaml` fused via `require("yaml")` (~119 KB)** because Live Preview `metadata()` → `frontmatter()` → `loadYaml()` sat on the cold graph |
| YAML parse (WorkVault FM ~20 KB) | ~2–3 ms once the runtime is warm — dominate cost was package download/eval on the editor entry, not `parseDocument` |
| Properties chrome | ~66 KB entry; shared CM6/markdown-it already in the editor graph |
| Chrome configure vs glyphs | Still gated on first-paint `rAF` even when chrome chunks finished during `root.settled()` |
| Host critical panels | `cursorBridgePanelHost` still ran before ready text returned (not needed for Properties+heading+body) |

## Strategy (wave 9)

1. **YAML off the editor static graph** — `preloadYaml()` uses `import("yaml")`.
   Webview builds define `__LUMIERE_WEBVIEW__` so the sync `require("yaml")`
   branch in `loadYaml()` is DCE'd. Bootstrap **awaits `preloadYaml()` before
   `root.settled()`** so Live Preview `metadata()` still sees a warm runtime.
   `preloadChromeFeatures()` also warms YAML in parallel with Properties
   chunks. An esbuild `onEnd` strip (`strip-dead-yaml-static.mjs`) removes
   esbuild's unused static `import {…} from yaml-chunk` leftover beside the
   dynamic import (that leftover alone kept YAML on the cold graph).
2. **Chrome configure without waiting for first-paint rAF** — same scheduling
   idea as #286 **without** `modulepreload` / `chrome.js` entry (that was the
   bandwidth fight with `editor.js`). `mw:first-paint` still marks on rAF.
3. **Defer `cursorBridgePanelHost`** until `editor/session-ready` (Edit/Chat
   handoff is not on the interactive critical path).
4. **Lazy `createRenderer()` in Properties sheet HTML** — do not run
   markdown-it plugin setup at module evaluate; only when a wiki-link value
   needs `renderInline`.

## Bundle (production, this box)

| Asset | #285 (`be30d581`) | Wave 9 | Delta |
| --- | ---: | ---: | ---: |
| Webview `editor.js` static closure | ~869 KB | **~765 KB** | **−~104 KB** (YAML package) |
| YAML package chunk | fused into editor static | async `browser-*.js` → `chunk-HV4*.js` (~104 KB), warmed by `preloadYaml()` | fetch overlaps ready / plugin setup |

## Host GUI

Not remasured here (integ pid left alone; no 0.0.0 clobber). Coordinator
cold-opens WorkVault `AI 活动平台上云.md` on this tip and judges glyphs /
interactive / Properties gap vs #285 (~0.6 s / ~1.0 s / ~0.4 s). Hold merge
if interactive regresses.

## Marks

`mw:main` → `mw:ready` → (await YAML) → `mw:plugins` → `mw:first-paint` (rAF)
and `mw:properties` (chrome configure; may precede or follow first-paint) →
`mw:features`.

## Correctness

- No `#mw-boot` / escaped body skeleton.
- No `modulepreload` chrome entry (#286 path).
- Sources open RPC stays on the critical host set with the sheet.
- Host still lazy-requires `yaml-runtime.cjs` (unchanged).
- Unit: `pnpm typecheck`; properties / webview-html unit suite green.
