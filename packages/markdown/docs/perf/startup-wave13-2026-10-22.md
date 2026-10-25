# Startup / first-open wave 13 (2026-10-22)

Stacked on #290 / `main` tip `51dd8329` (Host GUI after wave 12: glyphs
~0.6 s, **body-first** heading+body ~0.8 s, Properties sheet ~1.3 s trailing).
Target: pull **Properties ready closer to body** without regressing body ~0.8 s
or glyphs ~0.6 s. Prefer Properties ≤~1.0 s; at least beat ~1.3 s.

## Closed waves — do not repeat

| Wave | Cut | Host GUI |
| --- | --- | --- |
| #286 | `modulepreload` chrome + earlier Properties | interactive **~1.3 s** REGRESS |
| #287 | dynamic YAML off editor static + earlier chrome | interactive **~1.3 s** REGRESS |
| #288 | serialize paint preload **after chrome resolve** | same **~0.6 / ~1.0 / ~0.4** (**no win**) |
| #289 | extend first-paint parse through YAML fence | **~0.8 s / ~1.1 s REGRESS** |

#290 (wave 12) already decoupled body from Properties via a core Live Preview
frontmatter placeholder. The remaining ~0.5 s Properties trail is sheet chunk
fetch + configure/render settle — not missing heading in the prefix tree.

## Profile (body → Properties after #290)

| Time | What |
| --- | --- |
| ~0.6 s | glyphs = raw frontmatter (prefix tree) |
| ~0.8 s | placeholder collapses fence → heading + body |
| ~1.3 s | real Properties sheet replaces placeholder |

Chrome preload still started **together** with paint structure (tables,
callouts, …) during `root.settled()`, so the Properties/Sources graph shared
the settle-window wire with ~paint-structure chunks. Chrome configure also
waited on tags + lineNumbers even though neither is required for the sheet.

## Strategy (wave 13)

1. **Shrink chrome/sheet set** — `phase: "chrome"` / `preloadChromeFeatures()`
   load only `properties` + `sourcesProperty`. `tags` and `lineNumbers` move
   to the paint set (still before the deferred "all" phase).
2. **Defer paint preload kickoff to first-paint rAF** — chrome owns the
   settle-window download alone; paint structure `import()` starts on the
   first-paint frame. **Not** #288: paint does **not** wait for
   `chromeChunks.resolve` — it overlaps sheet configure once the sheet graph
   is warm.
3. **Lazy `createRenderer()` in Properties sheet HTML** — defer markdown-it
   plugin setup until a wiki-link value needs `renderInline` (module evaluate
   no longer pays that cost on every Properties chunk load).
4. **No** modulepreload chrome, **no** boot skeleton, **no** YAML graph rip,
   **no** paint-after-chrome-resolve serialization, **no** larger first-paint
   parse, **no** chrome-before-rAF.

## Host GUI gate

Cold-open the same large tall-fence fixture on this tip:

- Properties sheet **earlier than ~1.3 s** (prefer ≤~1.0 s) **without** body
  regress (~0.8 s) or glyphs regress (~0.6 s)
- Pure no-win (Properties still ~1.3 s) or body/glyphs regress → close without
  merge

Integ pid left alone; coordinator remasures. No Cloud Agents / Codex. Live
Preview only.

## Marks

`mw:main` → `mw:ready` → `mw:plugins` → `mw:first-paint` (rAF; paint preload
starts) → `mw:properties` (sheet configure; Properties/Sources only) →
`mw:features` (paint including tags/lineNumbers, then deferred).

## Correctness

- Sources open RPC stays on the critical host set with the sheet.
- Notes without a YAML fence unchanged; placeholder still yields when a
  `kind: "properties"` renderer registers.
- Unit: existing properties / frontmatter-placeholder suites; `pnpm typecheck`
  in `@workshop/markdown`.
