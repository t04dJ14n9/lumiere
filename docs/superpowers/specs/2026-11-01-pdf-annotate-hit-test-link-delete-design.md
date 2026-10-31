# Design: PDF Annotate hit-test, Copy Link, Delete

**Date:** 2026-11-01  
**Approved:** user via Lumière Projects (~00:47 Asia/Shanghai)  
**Repo:** `t04dJ14n9/lumiere`  
**Package:** `packages/pdf`  
**Risk:** Medium (product/UI)  
**Ancestry:** `docs/superpowers/specs/2026-10-30-pdf-annotations-direct-to-pdf-design.md` (#457/#464 shipped create + status-bar Annotate)

## Goal

In **Annotate mode only**, let the user click an existing annotation to select it, then Delete/Backspace or context-menu **Delete** to remove it (via EmbedPDF → existing save-on-commit), and context-menu **Copy Link for Agent** using the same clipboard shape as text/region selection: `[basename · p.N](path#page=&viewrect=…)` plus optional `>` quote when text is available.

## Non-goals

- Always-on annotation hit-testing in View / Select Text / Select Region (must keep today’s drag select).
- New annotation-id URL scheme (unless a trivial freebie; not required).
- MCP / agent write tools for annotations.
- Changing status-bar Annotate toolkit / save pipeline.

## Decisions (locked)

| Topic | Decision |
|--------|----------|
| Hit-test surface | `AnnotationLayer` `pointerEvents: "auto"` **only while** `tool === "annotate"`; `"none"` otherwise (preserves text/region). |
| Selection | EmbedPDF click-select (`getSelectedAnnotations` / `selectAnnotation`). |
| Delete | EmbedPDF `deleteAnnotation(s)` → existing `onAnnotationEvent` committed → saveAsCopy host path. |
| Keys | Delete/Backspace delete selected annotation(s) in Annotate mode; ignore when focus is in an editable field (`input`/`textarea`/`contenteditable`). |
| Copy Link | Reuse `agentText` + `path#page=&viewrect=` + quote. Prefer underlying page text in the mark’s box when readable; otherwise annotation contents if any; else link-only. |
| View mode | Unchanged: Copy Link still requires `lumiere.pdf.hasSelection` for text/region. |
| Look Up | Investigate Mac force-click / trackpad Look Up on words if the same webview surface is touched; fix if in path, else note follow-up in PR. |

## Architecture

1. **Page layer:** Pass annotate mode into `Page` / `PageLayers`; set AnnotationLayer `pointerEvents` from mode.
2. **Selection bridge:** Webview tracks EmbedPDF selected annotations; report a synthetic `PdfSelection` (prefer `kind: "region"` from annotation rect + extracted text) to the host so `AgentHandoff.copyLinkForAgent` works unchanged, **or** extend menu context + a dedicated path that builds the same agent text from annotation geometry. Prefer reusing `AgentHandoff` / `agentText` without a second clipboard format.
3. **Context keys / menu:** Extend `data-vscode-context` / host context so Copy Link shows for annotation selection in Annotate mode (`hasSelection` or new `hasAnnotationSelection`). Add **Delete** menu item (`lumiere.pdf.deleteAnnotation`) when an annotation is selected in Annotate mode.
4. **Commands:** Register delete command; wire webview Delete/Backspace → delete selected; menu Delete → same.
5. **Tests:** Unit (pointer-events by mode; agent text from annotation rect; menu when-clauses; key handler ignores inputs). Browser: annotate → create → click select → Delete; context Copy Link; View mode text select still works.

## Success criteria

- Annotate: click mark → selected; Delete/Backspace or menu Delete removes it and persists via existing save.
- Annotate: menu Copy Link matches handoff fixture shape.
- Text/Region tools: AnnotationLayer does not steal pointer events; existing Copy Link still works.
- Escape still leaves Annotate; History undo still restores deletes in-session.

## Out of scope / follow-ups

- Annotation hit-test outside Annotate mode.
- Multi-page marquee select UX polish beyond what EmbedPDF already does.
- Look Up fix if root cause is outside this PDF annotate/selection surface (document in PR).
