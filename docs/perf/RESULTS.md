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
Prism grammars load on demand, only for the languages a note uses. No CI perf budget:
timings on shared runners vary far more than a budget that would catch regressions.
