# Quality checks

Every pull request must keep scrolling smooth and notes quick to open.
`pnpm test:quality` checks both, and CI's `quality` job runs it as a merge
gate (AGENTS.md, "Merge gate").

## What is checked

| Check | Where | Guards against |
| --- | --- | --- |
| No wheel or touch listener that is not passive, anywhere in the page | `scroll.quality.ts` | Chromium waiting on the page before every scroll gesture (two such listeners before #410) |
| Text holds still while blocks render: 12 steps down, a far jump, 8 steps up, and a block across the top edge growing by 200 px | `scroll.quality.ts` | Text jumping under the reader (213 px after a far jump during #410) |
| A flick straight after opening a 40-section note with diagrams: worst frame and frames over 50 ms | `scroll.quality.ts` | Stalls in the first scroll (125 to 151 ms frames before #410) |
| Scrolling and jumping through a 1 MB note: longest task | `scroll.quality.ts` | Parsing the whole note inside a scroll update (139 ms before #410) |
| First paint, and every feature loaded, for a small note, a 16,000-block note and a note with diagrams | `open.quality.ts` | Slower opening in the webview |
| The real Markdown host on an in-memory vault of 3,000 and 30,000 files: bytes sent to an open note per vault change, host work per change, and `ready` in the large vault | `large-vault.test.ts` | Work that grows with the vault (megabytes per change and seconds of host time in the CVM's 126,000-file vault, October 2026) |

The browser checks run the real webview in Chromium with the browser
harness's host (`test/browser/fake-host.ts`); the host check runs the real
host wiring (`src/host/bootstrap.ts`) with fakes for VS Code.

## Budgets

`budgets.ts` holds every budget with the regression it guards. Counts,
bytes and pixels are exact. Times are for the reference machine (an Apple
M-series Mac) and stretch on slower ones by a measured speed factor: the
fastest of nine parses of a fixed 74 KB note (`calibration.ts`, and
`calibrationParseMs` in the harness page), against the reference machine's
time. A fast machine is never given more time than the reference.

Raise a budget only with the owner's approval and the measurement that
shows why. A timing check that fails once and passes on its retry is
reported as flaky; rerun before merging instead of raising the budget.

## Running

```sh
pnpm test:quality
```

Each run appends its measurements to `test-results/quality.json`, one JSON
object per line, so runs can be compared; CI keeps the file as the `quality`
artifact. Run nothing else on the machine at the same time: other work
shows up as slower frames.

The real-editor probes (VS Code and Cursor, over Remote-SSH too) are not
part of this gate: they cannot run in CI. Their method is in
`packages/markdown/IMPLEMENTATION_PLAN.md` ("Scroll stability in VS Code and
Cursor", "Opening notes in a large vault").
