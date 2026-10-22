# Startup / first-open wave 10 (2026-10-22)

Stacked on #285 / `main` tip `be30d581` (Host GUI: glyphs ~0.6 s, Live
Preview interactive ~1.0 s, Properties gap ~0.4 s). Target: cut interactive
further under ~1.0 s (or hold ≤1.0 s with a clearer glyphs/Properties win)
toward Obsidian-feel.

## Why not #286 / #287

| Wave | Cut | Host GUI |
| --- | --- | --- |
| #286 | `modulepreload` chrome.js + chrome configure before first-paint rAF + defer cursorBridge | interactive **~1.0 → ~1.3 s** |
| #287 | dynamic `import("yaml")` off editor static + chrome before rAF + defer cursorBridge + lazy createRenderer | glyphs ~0.8 s, interactive **~1.3 s** |

Do **not** revive modulepreload chrome, boot skeletons, earlier-chrome-without-rAF,
or ripping YAML out of the editor static graph when that delays frontmatter
before interactive.

## Profile (glyphs → interactive gap on #285)

After #285, chrome **configure** no longer waits on the tables promise, but
chrome and paint **downloads still start together** during `root.settled()`:

| Preload set | Approx entry bytes (prod tip) |
| --- | ---: |
| Chrome (`properties` / `sourcesProperty` / `tags` / `lineNumbers`) | ~78 KB (Properties alone ~67 KB) |
| Paint structure (`tables` / `callouts` / `codeBlocks` / `links` / `smartLists` / `tasks`) | ~89 KB (tables alone ~57 KB) |

On a cold webview those ~167 KB race for the same connection while core Live
Preview is settling toward first glyphs. The ~0.4 s Properties gap after
glyphs is consistent with Properties still sharing bandwidth (and parse) with
tables/codeBlocks/links rather than owning the wire until the sheet is ready.

Sync `yaml` stays on the editor graph (large-fixture FM parse itself is ~2–3 ms
once warm; #287 showed moving it off the static graph hurt TTI).

## Strategy (wave 10)

1. **Serialize paint preload after chrome chunks** — `preloadChromeFeatures()`
   still starts as soon as the Obsidian preset is known. `preloadPaintFeatures()`
   starts only in `chromeChunks.then(...)`, so tables/callouts do not starve
   the Properties graph on the wire.
2. **Keep first-paint rAF before chrome configure** — same schedule as #285;
   do not move Properties ahead of `mw:first-paint` (that pattern failed in
   #286/#287).
3. **Keep sync YAML** on the editor static graph.
4. **No** `modulepreload` chrome entry, **no** `#mw-boot` skeleton, **no**
   host critical-panel reshuffle in this wave (cursorBridge deferral alone was
   never measured in isolation; leave it for a later single-factor tip).

## Expected Host GUI gate

Cold-open the large cold-open fixture on this tip:

- interactive **≤ ~1.0 s** vs #285 (prefer better / smaller Properties gap)
- glyphs should stay in the ~0.6 s class (core LP path unchanged)

Hold merge if interactive regresses. Integ pid left alone; coordinator remasures.

## Marks

`mw:main` → `mw:ready` → `mw:plugins` → `mw:first-paint` (rAF) →
`mw:properties` (chrome configure; chrome chunks should already be warm) →
`mw:features` (paint then deferred). Paint chunk fetch may overlap chrome
configure CPU once chrome resolve fires.

## Correctness

- Sources open RPC stays on the critical host set with the sheet.
- Paint features still configure before the deferred "all" set; only their
  *download start* is serialized behind chrome.
- Unit: existing webview / properties suites; `pnpm typecheck` in
  `@workshop/markdown`.
