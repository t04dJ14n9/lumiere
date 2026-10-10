# Editor load time — 2026-10-10

The three changes target the recorded CPU profile. `src/kernel` and plugin
startup ordering are unchanged. There is no measured browser after result in
this sandbox; `after.json` is left for the owner.

## Recorded browser and native baseline

These are different harnesses and must not be combined with the Node diagnostics
below. Inclusive CPU times overlap and must not be added together.

| Measure | Before | After | Change |
| --- | ---: | --- | --- |
| Chromium/fake-host open, 16,000 blocks | 1,194 ms | Pending re-profile | All changes below |
| Gutter `foldRange` → `headings` → `extractMetadata`, inclusive | 310 ms | Pending re-profile | Lazy line queries and cached heading ranges |
| Live Preview `index`, inclusive | 212 ms | Pending re-profile | Cached structural discovery and declared renderer node types |
| All Prism language initialization, inclusive | 195 ms | Pending re-profile | Per-language loading |
| Native first paint, 16,000 blocks (`before.json`) | 2,473 ms | Pending owner run | Preserve `mw:*` marks for comparison |
| Native first paint, small cold note (`before.json`) | 524 ms | Pending owner run | Same |

The folding gutter no longer extracts headings, links, footnotes and other
metadata for the entire document. It queries the requested line in the cached
syntax tree and finds the next sibling heading of equal or shallower level.
Ranges, including missing folds, are cached by immutable `Text` identity, so
edits invalidate them. Heading scope, setext handling and indentation behavior
are preserved.

The block index already handled text edits incrementally. Startup repeatedly
scanned all syntax when each renderer registered, including inline syntax, and
called unrelated match predicates. Built-in renderers now declare complete
eligible node-name lists. Structural nodes are cached once per tree, retaining
parent traversal and catalog precedence. Regional edits still use bounded Lezer
walks. Renderers without declarations, or with inline node targets, keep full
discovery.

Prism's all-language entry is now used only by unit tests as a behavior reference.
Production loads the core/registry on the first labelled fence and requests
language components on demand. Required/optional components and modifiers retain
the former highlighting behavior, including embedded syntax. TypeScript needs
26 related components; Python and Rust each need one. Shared modifiers also load
their targets before running, preserving languages requested later. Components are awaited in
Prism's order because static side-effect imports can be reordered by ESM chunk
splitting. Alias requests share promises; failed loads can retry. Rendered
Markdown snippets load their nested fence languages too. Async DOM writes still
check the source view/render-pass lifetime after loading.

No additional plugin startup deferral was introduced: Chromium could not run,
so there is no new profile identifying another dominant cost or justifying a
change to startup timing.

## Measured state work in Node

Command: `node --import tsx scripts/measure-open-state.ts 16000`. The same
683,331-character note from `perf-note.ts` is used at each stage. Seven fresh
states per stage; medians include warm-up samples. The syntax tree is prepared
before timing. Folding queries the first 15 lines; indexing simulates eight
successive renderer registrations with predicates returning false, isolating
discovery from widget/DOM work. These are diagnostics, not editor open times.

| Stage | Folding median | Indexing median | Renderer predicate calls |
| --- | ---: | ---: | ---: |
| Before | 178.83 ms | 107.09 ms | 4,104,036 |
| After lazy heading folds | 0.27 ms | 113.28 ms | 4,104,036 |
| After structural discovery cache | 0.25 ms | 29.39 ms | 42,000 |

Raw milliseconds, in execution order:

| Stage | Folding samples | Indexing samples |
| --- | --- | --- |
| Before | 272.35, 250.73, 171.13, 178.83, 164.12, 223.82, 151.95 | 135.02, 189.41, 110.98, 106.72, 107.09, 91.27, 101.30 |
| After folding | 1.33, 0.27, 0.25, 0.51, 0.31, 0.27, 0.20 | 141.10, 105.66, 113.28, 83.66, 113.68, 115.88, 103.99 |
| After indexing | 2.22, 0.49, 0.25, 0.56, 0.23, 0.24, 0.21 | 54.30, 32.74, 34.60, 29.39, 27.32, 22.68, 23.84 |

## Measured Prism work in Node

Command: `node --import tsx scripts/measure-prism.ts`. Old and new highlighters
are bundled using the production Prism build plugin, then evaluated in separate
fresh VM globals, seven times. Build time is excluded. VM initialization includes
script evaluation and differs substantially from Chromium; these times must not
be compared to the recorded 195 ms browser sample.

| Work | Before, eager reference | After, lazy implementation |
| --- | ---: | ---: |
| Initializing the highlighter | 484.69 ms median, all languages | 3.83 ms median, core/registry only |
| First TypeScript request | Included above | 27.36 ms median, requested components only |
| Grammar loads without a language request | All languages if the old highlighter is imported | Zero, asserted by unit tests |

| Work | Raw samples, ms |
| --- | --- |
| Eager reference | 624.90, 701.10, 462.20, 484.69, 482.40, 482.57, 491.02 |
| Lazy core/registry | 36.12, 3.75, 3.83, 3.70, 4.17, 3.91, 3.57 |
| Lazy TypeScript request | 51.96, 26.65, 26.57, 30.34, 27.36, 27.83, 27.26 |

The unminified production build's code-highlight entry falls from the recorded
863 KiB to 66 KiB. Its static dependencies total about 68 KiB; loading TypeScript
and its dependencies totals about 159 KiB across 29 JS files (including that
initial graph). The editor's initial static import graph contains no Prism code.
The cost is more small asset files: total webview JS grows from 10,883,580 bytes to
about 11.05 MB; the editor entry grows from 2,130,937 to about 2,135,000
bytes. Browser network latency for the sequential component requests still needs
measurement.

## Validation and re-measurement

Targeted units cover bounded gutter traversal and cache invalidation, equivalence
with metadata heading ranges, cached discovery across registrations, preserved
nesting/precedence/ranges and unrestricted renderers, no-request grammar loading,
aliases/concurrency/retries, eager/lazy highlighting parity, Markdown embedded
languages, shared modifiers on later requests and actual ESM chunk loading.
Existing smoke suites are not expanded.
The missing `note` import in `test/vscode/perf.spec.ts` was restored so the owner
can run the native measurement.

Final checks, run sequentially:

| Check | Result |
| --- | --- |
| Requested Prettier command on changed files | Passed; Markdown is skipped by the repository's `.prettierignore` |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed, all projects |
| `pnpm build` | Passed |
| `node scripts/test.mjs` | Cannot start `tsx`: sandbox IPC pipe `listen EPERM` |
| Complete unit list via `node --import tsx --test --test-concurrency=4` | 170/171 files passed, including the 14 new regression cases; `layers.test.ts` fails because its `spawnSync` returns `EPERM`, not a compiler diagnostic |
| Focused final regression run | 7/7 files passed: folding, block discovery/invalidation/cost, code offsets, language promises and eager/ESM highlighting parity |
| The three platform-layer compiler fixtures, run directly | All produced the expected rejection diagnostics: DOM `TS2584`, VS Code/Node `TS2322` |
| `pnpm test:browser` | Build/harness succeeded; all 47 existing cases blocked by Chromium aborting before page creation with `Operation not permitted` |
| Native smoke/performance | Not run; no native wiring changed, native after measurement remains owner-run |

Local validation logs: `/tmp/mdwb-perf-unit-final.log` and
`/tmp/mdwb-perf-browser.log`. The fallback unit command enumerates exactly the
same `src/**/*.test.ts` and `test/unit/**/*.test.ts` files as `scripts/test.mjs`.
The layer test itself was not changed or skipped. Its direct compiler checks
confirm the pure-layer restrictions, but the normal suite still needs an owner
run where subprocess capture is permitted.

Both profile launch attempts failed: `pnpm exec tsx` cannot create its IPC pipe
(`listen EPERM`); bypassing that with `node --import tsx scripts/profile-open.ts
16000` reaches Chromium, which aborts at `sandbox_host_linux.cc` with `shutdown:
Operation not permitted`. The pinned `~/Code/human-learning` checkout is absent;
the current implementation, recorded profile and existing parity tests were used.

On a machine that permits Chromium, run these commands sequentially:

```sh
pnpm build
node scripts/build-browser-harness.mjs
node --import tsx scripts/profile-open.ts 16000
pnpm test:browser
PERF_OUT=docs/perf/after.json pnpm exec playwright test -c test/vscode/playwright.config.ts test/vscode/perf.spec.ts
```

Repeat the profile at least three times and compare medians. Inspect whether
gutter metadata extraction and repeated index traversal disappear, which language
chunks actually load, and what remains dominant. The native run should compare
small cold and 16,000-block first paint, `mw:ready` → `mw:plugins`, script resources,
Ctrl+End latency, heap and DOM counts against `before.json`. Also profile a prose
note with no code to verify that no highlighter or language resources are fetched.
