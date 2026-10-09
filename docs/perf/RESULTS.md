# PDF load time (real VS Code 1.141, Linux Xvfb, shared noisy box)

`PERF=1 pnpm exec playwright test -c test/vscode/playwright.config.ts test/vscode/perf.spec.ts`
writes the numbers (`before.json` is the baseline on `main`, `after.json` this branch).
Times are ms after choosing the file; run-to-run noise on this box is about ±150 ms
(three runs of the same build gave first-page 1303-1720 ms for the small PDF).

| step | before (small) | after (small) | before (600 pages) | after (600 pages) |
|---|---|---|---|---|
| viewer script starts | 697 | 754 | 517 | 501 |
| PDF bytes arrive | 869 | 944 | 694 | 687 |
| engine ready | 1198 | 1271 | 822 | 811 |
| document opened | 1418 | 1488 | 1108 | 1080 |
| first page painted | 1672 | 1720 | 1373 | 1428 |

Activation: 4 ms. Bundles: viewer.js 3.1 MB (React, EmbedPDF and both PDFium
engines in one file; 86 ms to load), pdfium.wasm 4.6 MB.

What changed: the PDFium WASM is now fetched when the viewer starts, while the
host is still sending the PDF, instead of after the bytes arrive (`warmWasm`).
The saving is the fetch (110-300 ms in the baseline resource timings) taken off
the critical path, but it is below this box's noise, so **no gain is claimed**;
the remaining cost between "bytes arrive" and "engine ready" (about 125 ms warm,
about 330 ms cold) is worker start-up and WASM compilation. Splitting the
bundle (the main-thread engine is only a fallback) needs ESM output in the
webview and was not attempted.

No CI perf budget: the timings vary more than any budget that would catch a
regression without flaking.
