# Design: PDF annotations — direct-to-PDF (EmbedPDF Annotation + History)

**Date:** 2026-10-30  
**Repo:** `t04dJ14n9/lumiere`  
**Package:** `packages/pdf` (`@workshop/pdf`)  
**Status:** Owner-approved design; ready for implementation plan

## Goal

Ship a first-class PDF annotation UI in Lumière that writes **standard PDF annotations into the open file** so other readers (Preview, Acrobat, browsers) see the same marks. Use EmbedPDF’s Annotation and History plugins as the source of truth.

## Non-goals (v1)

- Markdown/JSON **sidecar** annotation stores (supersedes the 2026-10-10 feasibility default of sidecar-first).
- MCP/agent **write** tools (`create` / `update` / `remove` annotations) — existing MCP stays **read-only**.
- Export Annotated Copy as a separate product path (the open file *is* the annotated PDF).
- Bridging annotation undo into the VS Code workbench Undo stack.
- XFDF import/export.
- iPad / PencilKit / ink-from-`packages/ink` (tracked elsewhere in IPAD plans).

## Decisions (locked)

| Topic | Decision |
|--------|----------|
| Persistence | Write standard annotations **into the PDF** (no sidecar). |
| Tool set | **Full EmbedPDF toolkit:** highlight, underline, strikeout, squiggly, note / freeText, ink, shapes, stamp. |
| Save model | **Overwrite the open PDF in place** after each committed edit. |
| Undo / redo | EmbedPDF `@embedpdf/plugin-history`, **separate from VS Code Undo**. |
| Agents | **UI only** in v1. |
| Wiring | **Approach 1:** `@embedpdf/plugin-annotation` + `@embedpdf/plugin-history` as source of truth; map tools into existing chrome / slim / floating toolbars. |

This design **un-defers** the annotation system previously marked deferred in `packages/pdf/docs/HANDOFF_OPENAI.md` for the scope above. It **supersedes** sidecar-default guidance in older feasibility notes for desktop v1.

## Architecture

1. **Dependencies** (same EmbedPDF major as today, currently 2.15.1): add `@embedpdf/plugin-annotation` and peer `@embedpdf/plugin-history`.
2. **Registration:** extend `packages/pdf/src/webview/plugins.ts` to register Annotation + History alongside the existing document-manager / interaction / render / scroll / search / selection / spread / viewport / zoom set.
3. **Ownership:**
   - Annotation plugin: create / update / delete, hit-testing, active tool modes.
   - History plugin: undo / redo for annotation operations in the current webview session.
   - Host (`packages/pdf` extension side): on each **committed** annotation change, call engine `saveAsCopy`, write bytes to a temp file beside the open URI, then **atomic replace** the open PDF on disk; refresh the open document buffer so the editor matches disk.
4. **No sidecar** files, no parallel annotation JSON store.
5. **Agents / MCP:** leave existing read-only tools unchanged; do not add write annotation MCP in v1.

### Data flow

```
User tool action → Annotation plugin mutates page annots
                 → History records step
                 → Host save pipeline: saveAsCopy → temp → rename over open path
                 → Disk PDF is authoritative; reopen / other apps see marks
```

## UI / toolbar

- Add an **Annotate** mode beside **Select Text** / **Select Region** (`tool-mode.ts` and toolbar surfaces).
- In Annotate mode, expose the full toolkit (highlight, underline, strikeout, squiggly, note/freeText, ink, shapes, stamp) plus color / stroke controls where EmbedPDF supports them, and **Undo / Redo** bound to History.
- Existing find / zoom / fit / View controls remain available.
- Layouts: **chrome**, **slim**, and **floating** all get Annotate tools (parity with current toolbar modes).
- **Escape** or switching to Select Text exits Annotate mode.

Primary touch points: `toolbar.tsx`, `floating-toolbar.tsx`, host `plugins/pdfToolbar/`, `tool-mode.ts`.

## Persistence and errors

- Trigger: each **committed** annotation edit (not every pointer move while drawing).
- Pipeline: `saveAsCopy` → write temp → atomic rename/replace of the open file.
- **Dirty** only while a save is in flight or after a failed save; successful save leaves the buffer clean relative to disk.
- **Failure:** toast; keep in-memory annotations; retry on the next committed edit or an explicit Retry action.
- **Concurrent external change** (mtime / content hash mismatch before overwrite): prompt **Reload** vs **Keep mine** (Keep mine overwrites disk with the in-memory annotated bytes).
- No separate “Export Annotated Copy” in v1.

## History vs VS Code Undo

- **EmbedPDF History** is in-webview only. While the PDF custom editor is focused in Annotate (or after annotation edits), Undo/Redo buttons and in-viewer shortcuts drive the History plugin.
- **VS Code Undo** does not step through annotation operations in v1. After an in-place overwrite, the workbench sees an updated binary file; Ctrl/Cmd+Z in the workbench is not expected to reverse annotation strokes.
- Closing the PDF webview **drops** the History stack. Reopen loads whatever is on disk.
- File-level revert remains Timeline / Local History (if recorded for binaries), git, or Restore — not EmbedPDF History.

## Testing

- **Unit:** Annotation + History plugin registration/wiring; save pipeline (temp → rename) including failure paths.
- **Browser / Host GUI:** for each toolkit tool, create a mark, confirm visible after reopen of the same file; undo/redo within the session; open the file in another reader or poppler-based check and confirm marks; simulate concurrent external edit and verify Reload vs Keep mine.
- **Out of test scope for v1:** MCP write tools.

## Out of scope / follow-ups

- MCP / agent annotation write APIs.
- Export Annotated Copy / Save As copy-preserving original.
- Workbench Undo bridge for annotations.
- XFDF.
- Pencil / iPad ink path and `packages/ink` integration.
- Deep skinning of EmbedPDF annotation chrome beyond toolbar mapping (acceptable to ship upstream look first).

## Success criteria

- User can annotate with the full toolkit and see marks in Lumière and in external PDF readers after save.
- Undo/redo works within the open session via History; closing the tab does not promise stroke-level undo.
- Failed saves never silently drop in-memory work; external conflicts are explicit.
- No sidecar files appear beside PDFs for this feature.
