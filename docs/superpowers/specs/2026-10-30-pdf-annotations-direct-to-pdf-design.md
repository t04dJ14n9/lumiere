# Design: PDF annotations — direct-to-PDF (EmbedPDF Annotation + History)

**Date:** 2026-10-30  
**UI amendment:** 2026-10-31 (Asia/Shanghai, 金扬) — status bar + command palette only  
**Repo:** `t04dJ14n9/lumiere`  
**Package:** `packages/pdf` (`@workshop/pdf`)  
**Status:** Owner-approved design; UI amendment locked; ready for implementation plan

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
| Wiring | **Approach 1:** `@embedpdf/plugin-annotation` + `@embedpdf/plugin-history` as source of truth. |
| UI | **VS Code status bar + command palette only.** Annotate mode, the full toolkit, and History undo/redo are exposed there. A setting is used only if a persisted color default is needed. Slim and floating toolbars are not annotation surfaces, and neither is an in-viewer annotation bar. Same control-surface rule as page colors (#454). |

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
6. **Controls:** the VS Code status bar and the command palette (see [UI](#ui)). Annotation tools are not mounted on a slim bar, a floating bar, or an in-viewer bar.

### Data flow

```
User tool action → Annotation plugin mutates page annots
                 → History records step
                 → Host save pipeline: saveAsCopy → temp → rename over open path
                 → Disk PDF is authoritative; reopen / other apps see marks
```

## UI

Owner amendment (金扬, 2026-10-31, Asia/Shanghai), matching page-colors status-bar-only (#454, design #453):

- **Annotate** is a tool mode beside **Select Text** / **Select Region** (`tool-mode.ts`). Enter and leave it from the VS Code **status bar** and the **command palette**. **Escape** or switching to Select Text also leaves Annotate mode.
- While Annotate is active, the status bar shows the active toolkit tool (a quick pick of highlight, underline, strikeout, squiggly, note/freeText, ink, shapes, stamp), a **color** quick pick where EmbedPDF supports color or stroke, and History **Undo** / **Redo**. The command palette runs the same commands.
- Order in `STATUS_BAR_ORDER`: the annotate cluster sits after `find` and before `view` (`annotate`, `annotationTool`, `annotationColor`, `annotationUndo`, `annotationRedo`). Page colors stays near `view`, left of page and zoom. Optional icon buttons follow `lumiere.pdf.toolbar.statusBarButtons`. When `lumiere.pdf.toolbar.mode` is `none`, those status entries are hidden and the command palette and keybindings remain.
- Find, zoom, fit, and View stay on the status bar, as they do after #454.
- Annotate keybinding `Ctrl+Alt+A` (`⌃⌘A` on macOS). History undo/redo keybindings must leave workbench Undo (`Cmd/Ctrl+Z`) alone.
- Surfaces that do not carry annotation tools: the slim viewer bar, the floating bar, the editor-title tool strip, and any in-viewer toolkit or overlay bar. Stand-alone hosts that still draw a slim bar for other PDF controls do not add an Annotate toolkit to that bar; they use commands.

Primary touch points: `packages/pdf/src/extension/plugins/pdfToolbar/status-bar.ts`, `status-bar-layout.ts`, `annotation-picker.ts` (toolkit and color quick picks), `packages/pdf/contributes.json` (command palette and keybindings), `tool-mode.ts`. `toolbar.tsx` and `floating-toolbar.tsx` are not annotation surfaces.

## Persistence and errors

- Trigger: each **committed** annotation edit (not every pointer move while drawing).
- Pipeline: `saveAsCopy` → write temp → atomic rename/replace of the open file.
- **Dirty** only while a save is in flight or after a failed save; successful save leaves the buffer clean relative to disk.
- **Failure:** toast; keep in-memory annotations; retry on the next committed edit or an explicit Retry action.
- **Concurrent external change** (mtime / content hash mismatch before overwrite): prompt **Reload** vs **Keep mine** (Keep mine overwrites disk with the in-memory annotated bytes).
- No separate “Export Annotated Copy” in v1.

## History vs VS Code Undo

- **EmbedPDF History** is in-webview only. While the PDF custom editor is focused in Annotate (or after annotation edits), status-bar Undo/Redo and command-palette commands drive the History plugin.
- **VS Code Undo** does not step through annotation operations in v1. After an in-place overwrite, the workbench sees an updated binary file; Ctrl/Cmd+Z in the workbench is not expected to reverse annotation strokes.
- Closing the PDF webview **drops** the History stack. Reopen loads whatever is on disk.
- File-level revert remains Timeline / Local History (if recorded for binaries), git, or Restore — not EmbedPDF History.

## Testing

- **Unit:** Annotation + History plugin registration/wiring; save pipeline (temp → rename) including failure paths; status-bar order and command ids for Annotate, the toolkit, color, and undo/redo.
- **Browser / Host GUI:** for each toolkit tool, create a mark, confirm visible after reopen of the same file; undo/redo within the session; open the file in another reader or poppler-based check and confirm marks; simulate concurrent external edit and verify Reload vs Keep mine. Host GUI uses the status bar and the command palette. Browser tests drive the same viewer actions and do not require a slim, floating, or in-viewer annotation bar.
- **Out of test scope for v1:** MCP write tools.

## Out of scope / follow-ups

- MCP / agent annotation write APIs.
- Export Annotated Copy / Save As copy-preserving original.
- Workbench Undo bridge for annotations.
- XFDF.
- Pencil / iPad ink path and `packages/ink` integration.
- Slim, floating, and in-viewer annotation toolbars (status bar + command palette only).
- Deep skinning of EmbedPDF’s own annotation widgets (acceptable to ship the upstream look first).

## Success criteria

- User can annotate with the full toolkit from the status bar and the command palette, and see marks in Lumière and in external PDF readers after save.
- Undo/redo works within the open session via History; closing the tab does not promise stroke-level undo.
- Failed saves never silently drop in-memory work; external conflicts are explicit.
- No sidecar files appear beside PDFs for this feature.
