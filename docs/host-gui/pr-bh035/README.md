# Host GUI — BH-035 expanded (+) callout title fold

Tip after #314 (`258bf393`). Integ DISPLAY :7, Reload-only `0.1.5-pr-BH034`.

## Gate

`Callouts.md` → expanded `[!question]+ Expanded, foldable` → click **title text** (not padding) → body collapses; source unchanged; click again restores.

## Shots

| File | What |
| --- | --- |
| `01-before-expanded-open.png` | Expanded callout with body “Click the title to collapse.” |
| `02-after-title-fold.png` | After title click: chevron `>`, body gone, Nested visible |
| `03-folded-by-default.png` | Collapsed `[!faq]-` control |
| `04-folded-expanded.png` | After chevron click: body “Click the title to expand.” |

Browser regression: `keyboard-widget-input.spec.ts` — `expanded (+) callout title click collapses without editing (BH-035)`.
