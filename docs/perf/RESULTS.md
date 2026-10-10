# Markdown load time (real VS Code 1.141, Linux Xvfb, shared noisy box)

`PERF=1 pnpm exec playwright test -c test/vscode/playwright.config.ts test/vscode/perf.spec.ts`
(`before.json` = `main`, `after.json` = this branch). The box was also running an
unrelated job during the "after" run, so absolute times (and the webview script start,
which doesn't depend on this change) are noisier than before; the table therefore also
gives times **from the webview script start**, which cancels most of that.

| note | metric | before | after |
|---|---|---|---|
| 16,000 blocks | webview script start (noise) | 300 | 738 |
| | host `ready` after script start | 867 | 19 |
| | plugins up after script start | 2155 | 528 |
| | **first paint after script start** | **2173** | **553** |
| | first paint, absolute | 2473 | 1291 |
| | heap (MB) | 67 | 43 |
| small (24 blocks) | first paint after script start | 164 | 191 (within noise) |
| | first paint, absolute | 524 | 878 (box noise: script start 360 → 687) |

Activation 15 → 19 ms (noise). Bundles: extension 1.50 MB unchanged; entry `editor.js`
2.13 MB (+4 KB); all webview JS 10.9 → 11.0 MB, now with one chunk per Prism language
instead of one 863 KB grammar chunk loaded at start.

What changed (details and Node micro-benchmarks in `after-notes.md`): folding ranges are
computed per requested line and cached instead of extracting metadata for the whole note
in the gutter (310 ms → ~0.3 ms); the stable-block index reuses discovery (107 → 29 ms);
Prism grammars load on demand, only for the languages a note uses. The package job now prints a bundle size table (`scripts/bundle-size.mjs`, against `bundle-baseline.json`) to the job summary and warns on growth over 10%; refresh the baseline with `--write-baseline` after a deliberate change. No CI timing budget:
timings on shared runners vary far more than a budget that would catch regressions.

## Interaction latency of lazy Prism (review B11-2)

`test/browser/code-latency.spec.ts` (Chromium, local chunks as in the webview; run on
the box, results in `test-results/code-latency.json`). It measures the cost the lazy
loading moves from startup to the first highlighted fence, with the same spec run on the
baseline (`before`, eager 863 KB grammar chunk) for comparison. Milliseconds, one run each,
shared box:

| | before | after |
|---|---|---|
| first fence (`ts`): editor visible, from `open()` | 312 | 98 |
| first fence highlighted, from `open()` | 310 | 120 |
| 20 languages in one view: all highlighted, from `open()` | 449 | 330 |
| 20 fences scrolled into view later: first / all highlighted | 312 / 312 | 80 / 156 |
| same fences scrolled in again | 41 | 50 |

So the lazy loading does not trade startup for visible latency here: the first fence is
highlighted about 20 ms after the editor is on screen, twenty languages load in parallel
(about 2.7x one language, not 20x; the spec fails if they serialise), and fences scrolled
into view get their grammar in 80-160 ms, faster than the old single grammar chunk because
a note only fetches what it uses. Limits: the chunks are on local disk here and in the
webview; they are not served over a network. Unmeasured: real VS Code (the webview resource
loader adds a few ms per chunk) and slower disks. The spec asserts only loose bounds
(first fence < 2.5 s after the editor is visible, 20 languages < 6 s, grammars loaded <
500 ms), because shared runners vary.
