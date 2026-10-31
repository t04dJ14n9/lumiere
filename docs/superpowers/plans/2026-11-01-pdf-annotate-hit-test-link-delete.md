# PDF Annotate hit-test + Copy Link + Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Annotate-mode annotation hit-test, context-menu Copy Link for Agent + Delete, Delete/Backspace, same agent link shape as text/region.

**Architecture:** Toggle AnnotationLayer pointer events only in Annotate mode; bridge EmbedPDF selection into existing AgentHandoff / agentText; add delete command + keys; keep View-mode text/region select intact.

**Tech Stack:** TypeScript, EmbedPDF `@embedpdf/plugin-annotation`, VS Code webview context menus, Vitest/node:test + Playwright browser tests in `packages/pdf`.

## Global Constraints

- Local implementation only (no new Cursor Cloud Agents).
- Follow `packages/pdf/AGENTS.md` and repo `AGENTS.md` / `REVIEW.md`.
- Clipboard stays `basename · p.N` + `#page=&viewrect=` + optional quote (`packages/agents/docs/agent-handoff-format.md`).
- Do not remount Annotate on slim/floating/in-viewer bars (#464).
- TDD: failing test before production code for each behavior.
- Risk Medium: Host GUI screenshots required before merge ask.

## File map

| File | Role |
|------|------|
| `packages/pdf/src/webview/page.tsx` | `pointerEvents` auto iff annotate |
| `packages/pdf/src/webview/viewer.tsx` / tool wiring | Pass annotate flag into Page |
| `packages/pdf/src/webview/annotation-selection.ts` (new) | Track selected annots; delete; build PdfSelection |
| `packages/pdf/src/webview/menu-context.ts` | Context for annotation selection |
| `packages/pdf/src/webview/viewer.tsx` or keys helper | Delete/Backspace |
| `packages/pdf/src/shared/command-ids.ts` + `contributes.json` | `deleteAnnotation` command + menu/keybinding |
| `packages/pdf/src/extension/plugins/pdfAnnotations/` or agentBridge | Wire delete command → webview action |
| `packages/pdf/src/shared/messages.ts` / view-commands | `deleteSelectedAnnotations` action |
| Unit + browser tests | Cover above |
| Spec (already written) | `docs/superpowers/specs/2026-11-01-pdf-annotate-hit-test-link-delete-design.md` |

---

### Task 1: Pointer events only in Annotate mode

**Files:**
- Modify: `packages/pdf/src/webview/page.tsx`
- Modify: callers that render `Page` so they pass `annotate: boolean` (or `tool`)
- Test: `packages/pdf/test/unit/page-annotation-layer.test.ts`

**Interfaces:**
- Produces: `PageProps.annotate: boolean`; AnnotationLayer style `pointerEvents: annotate ? "auto" : "none"`

- [ ] **Step 1:** Update unit test: when annotate false, assert `pointerEvents: "none"`; when annotate true, assert `"auto"` (source or rendered props pattern already used).
- [ ] **Step 2:** Run test — expect fail.
- [ ] **Step 3:** Thread annotate into Page; set pointerEvents from prop; update comment.
- [ ] **Step 4:** Tests pass; commit `fix(pdf): enable AnnotationLayer hit-test only in Annotate mode`.

### Task 2: Selection → PdfSelection + delete helpers

**Files:**
- Create: `packages/pdf/src/webview/annotation-selection.ts` (or `shared/` pure helpers + webview hook)
- Create: `packages/pdf/test/unit/annotation-selection.test.ts`
- Possibly shared: `packages/pdf/src/shared/annotation-handoff.ts` for rect → PdfSelection

**Interfaces:**
- Consumes: EmbedPDF `TrackedAnnotation` (`object.rect`, page index), existing `PdfSelection` / `PageRect` / `agentText`
- Produces: `selectionFromAnnotation(ann): PdfSelection` (region kind, 1-based page); `deleteSelected(scope)` calling `deleteAnnotations`

- [ ] **Step 1:** Failing unit tests for rect → region selection and multi-delete id list.
- [ ] **Step 2:** Implement pure helpers (PDF pageIndex 0-based → selection page 1-based; rect coordinate space matches geometry helpers).
- [ ] **Step 3:** Hook: `onStateChange` / selectedUids → report selection to host (reuse selection report path) when annotate + selected; clear when deselected.
- [ ] **Step 4:** Commit `feat(pdf): map selected annotations to PdfSelection for agent handoff`.

### Task 3: Context menu Copy Link + Delete

**Files:**
- Modify: `packages/pdf/src/webview/menu-context.ts`
- Modify: `packages/pdf/contributes.json` (`webview/context`)
- Modify: `packages/pdf/src/shared/command-ids.ts`
- Modify: pdfAnnotations or pdf plugin command registration
- Modify: host panels context keys if needed
- Test: contributions / menu-context unit tests

**Interfaces:**
- Produces: command `lumiere.pdf.deleteAnnotation`; when `webviewId == lumiere.pdf.viewer && lumiere.pdf.tool == 'annotate' && (hasSelection || hasAnnotationSelection)`; Copy Link when hasSelection (including annotation-sourced)

- [ ] **Step 1:** Failing tests for menu when-clauses and menuContext JSON keys.
- [ ] **Step 2:** Extend menu context; register Delete; Copy Link remains existing command (selection snapshot includes annotation-sourced).
- [ ] **Step 3:** Commit `feat(pdf): context menu Delete for selected annotations`.

### Task 4: Delete/Backspace keys

**Files:**
- Modify: `packages/pdf/src/webview/viewer.tsx` (or dedicated keys module)
- Modify: `packages/pdf/contributes.json` keybindings **or** webview-only keys (prefer webview so focus rules are local)
- Test: unit for “ignore when target is editable”

- [ ] **Step 1:** Failing test for key handler predicate.
- [ ] **Step 2:** On Delete/Backspace in annotate with selection, preventDefault and delete; skip editable targets.
- [ ] **Step 3:** Commit `feat(pdf): Delete/Backspace removes selected annotations in Annotate mode`.

### Task 5: Browser tests + Look Up note

**Files:**
- Modify/create: `packages/pdf/test/browser/annotations*.spec.ts`
- Investigate: `packages/pdf/src/webview/look-up.ts` vs MD Look Up — fix only if same surface; else PR note.

- [ ] **Step 1:** Browser: annotate → mark → click → Delete → gone; Copy Link path via selection; text tool still selects text with AnnotationLayer none.
- [ ] **Step 2:** Look Up: reproduce force-click if feasible in browser harness; fix or document follow-up.
- [ ] **Step 3:** Commit tests + any Look Up fix.

### Task 6: Verify, PR, Host GUI prep

- [ ] Run `pnpm check` from repo root (or package-scoped if documented) and PDF browser tests; paste evidence.
- [ ] Open PR vs main: Risk Medium, Testing, How to revert; link design; screenshots placeholders then Host GUI.
- [ ] Do not merge; report PR URL.

## Spec coverage self-check

- Annotate-only hit-test → Task 1  
- Copy Link shape → Task 2–3  
- Delete menu + keys → Task 3–4  
- View mode intact → Task 1 + 5  
- Look Up → Task 5  
