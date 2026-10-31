# Lumière Host GUI — PR #469 (Annotate hit-test / Copy Link / Delete)

- Commit / harness: `11a0e442` at `/workspace/host-gui-469-11a0e442/`
- DISPLAY: `:28`
- Cursor: headed window `workspace - Cursor` via `launch.sh` (extension already in `extensions/`, no `--install-extension`)
- PDF: `workspace/dummy.pdf` opened in Lumière PDF viewer
- Cursor left running

## Overall: PASS

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Open `dummy.pdf` in Lumière PDF viewer (status bar visible; Annotate available) | PASS | Tab `dummy.pdf`, page text “Dummy PDF file”, status bar shows Annotate, View, Follow (Dark), Page 1/1, Fit Width (198%). PDF outline item “Dummy PDF file 1”. |
| 2 | Enter Annotate and create a highlight on text | PASS | Status-bar Annotate entered annotate mode (cluster became Annotating / Highlight / Color). Drag across the title created a yellow highlight on “ummy PDF file” (drag started just after the leading “D”). |
| 3 | Click the mark so it is selected (hit-test) | PASS | `annotate-select-mark.png` — yellow highlight with a blue selection rectangle after clicking the mark. |
| 4 | Right-click selected mark: context menu shows Copy Link for Agent and Delete | PASS | `annotate-context-menu-copy-delete.png` — menu top items are **Copy Link for Agent** and **Delete Annotation** (command title is “Delete Annotation”, not the shorter word “Delete”), then Go to Page, Fit Width, etc. |
| 5 | Delete the mark and confirm it is gone | PASS | Chose **Delete Annotation**. `annotate-after-delete.png` — title is plain white text again; no yellow highlight (0 yellow pixels in the title region). Still in Annotating mode at capture time. |
| 6 | Leave Annotate; normal text select in View mode still works | PASS | Escape left annotate (status bar returned to “Annotate”, highlight/color cluster gone). Drag-select in view mode selected the whole title. `view-text-select-works.png` — dark selection block behind “Dummy PDF file”; status bar is View, not Annotating. |
| 7 | Optional: status bar annotate cluster while annotating | PASS | `annotate-status-bar.png` — Annotating, Highlight, Color, undo/redo, then View / Follow (Dark) / Page 1/1 / Fit Width (198%). |

## What each shot shows

- `annotate-select-mark.png` — Full Cursor window. Lumière PDF viewer on `dummy.pdf`. Yellow highlight on most of “Dummy PDF file” with a blue selection box (hit-test selection). Status bar in Annotating mode. Pointer is off the mark.
- `annotate-context-menu-copy-delete.png` — Same viewer with the mark still selected and the webview context menu open. First two items: Copy Link for Agent, Delete Annotation.
- `annotate-after-delete.png` — Same viewer after Delete Annotation. Highlight and selection box are gone; title is unhighlighted white text. Status bar still Annotating.
- `view-text-select-works.png` — After Escape. Status bar shows Annotate (not Annotating). “Dummy PDF file” has a normal text-selection background (View / Select Text), not an annotation.
- `annotate-status-bar.png` — Crop of the status bar while annotating, showing the annotate cluster (Annotating, Highlight, Color, undo/redo) beside View and page/zoom controls.

## Notes / non-blocking

- Highlight drag did not cover the first glyph “D”; the created mark, hit-test, menu, and delete were all on the highlight that was drawn.
- Delete menu label is **Delete Annotation**, matching `lumiere.pdf.deleteAnnotation` (“Delete Annotation”), not a bare “Delete”.
- Text-selection highlight on the dark theme is low-contrast (dark glyphs on a slightly lighter selection block) but covers the full phrase.
