# PDF Annotations (Direct-to-PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a first-class PDF annotation UI in Lumière that writes standard PDF annotations into the open file via EmbedPDF Annotation + History plugins, with in-place atomic overwrite and session undo/redo separate from VS Code Undo.

**Architecture:** Register `@embedpdf/plugin-annotation` and `@embedpdf/plugin-history` beside the existing EmbedPDF stack; mount `AnnotationLayer` per page; add an **Annotate** mode next to Select Text / Select Region that drives `setActiveTool` for the full toolkit. On each **committed** annotation change (including History undo/redo), the webview runs `engine.saveAsCopy`, posts bytes to the host, and the host writes a same-directory temp file then atomically replaces the open PDF while suppressing the self-write watcher reload. Agents/MCP stay read-only. Annotation controls are the VS Code **status bar** and the **command palette** only.

**UI amendment (2026-10-31, Asia/Shanghai, 金扬):** Tasks 10 and 11 target the status bar and the command palette. They do not add Annotate to a slim bar, a floating bar, or an in-viewer annotation bar. Other locked Cut B decisions are unchanged.

**Tech Stack:** TypeScript, React 19, EmbedPDF 2.15.1 (`@embedpdf/plugin-annotation`, `@embedpdf/plugin-history`), VS Code custom readonly editor + Node `fs` atomic rename, `node:test` / Playwright browser harness under `packages/pdf`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-30-pdf-annotations-direct-to-pdf-design.md` (also `/workspace/plans/pdf-annotations-spec/2026-10-30-pdf-annotations-direct-to-pdf-design.md`)
- Persistence: **direct-to-PDF only** — no Markdown/JSON sidecar for v1
- Toolkit v1: highlight, underline, strikeout, squiggly, note (`textComment`), freeText, ink, shapes (`square`/`circle`/`line`/`lineArrow`/`polygon`/`polyline`), stamp — **not** caret insert/replace, link-authoring, or redaction
- Save: `saveAsCopy` → temp beside open URI → **atomic replace** of the open file; trigger on each **committed** edit (not every ink pointer move)
- Undo/redo: EmbedPDF History plugin **only**, separate from VS Code Undo; closing the webview drops the History stack
- Agents/MCP: **UI only**; do not add write annotation MCP tools
- Wiring: Approach 1 — Annotation + History plugins are source of truth
- UI: **status bar + command palette only** (a setting only if a persisted color default is added). Annotate mode, the toolkit quick pick, color quick pick, and History undo/redo live there. Out: slim toolbar, floating toolbar, editor-title tool strip, and any in-viewer annotation bar (`toolbar.tsx`, `floating-toolbar.tsx`, `annotation-toolbar.tsx`, `annotation-chrome-bar`). Same control-surface rule as page colors (#454). When `toolbar.mode` is `none`, status entries hide and the command palette and keybindings remain
- Scope of this plan: **annotations + history ONLY** — not rotate, pan, fullscreen, Export Annotated Copy, XFDF, PencilKit/`packages/ink`, or workbench Undo bridge
- EmbedPDF packages pinned to **2.15.1** (same as `@embedpdf/core` today)
- Webview messages remain untrusted: every new viewer→host payload goes through `parseViewerMessage`
- Do not confuse extension plugin `pdfHistory` (jump back/forward) with EmbedPDF `@embedpdf/plugin-history` (annotation undo)
- Prefer EmbedPDF components/events over re-implementing them (`packages/pdf/AGENTS.md`)
- Host GUI after VSIX when code lands; never commit Host GUI PNGs

---

## File map

| File | Responsibility |
| --- | --- |
| `packages/pdf/package.json` | Add `@embedpdf/plugin-annotation` + `@embedpdf/plugin-history` @ 2.15.1 |
| `packages/pdf/src/webview/plugins.ts` | Register History then Annotation after Selection |
| `packages/pdf/src/webview/page.tsx` | Mount `AnnotationLayer` under `SelectionLayer` |
| `packages/pdf/src/shared/view-state.ts` | Extend `ToolMode` with `"annotate"`; parse/actions (Task 4). Task 10 adds `annotationTool`, `canAnnotationUndo`, `canAnnotationRedo`, and `setAnnotationColor` |
| `packages/pdf/src/shared/annotation-tools.ts` | **Create:** toolkit id union, labels, icons, color presets |
| `packages/pdf/src/webview/tool-mode.ts` | Enter/exit Annotate; clear region/text; deactivate annotation tool on exit |
| `packages/pdf/src/webview/annotation-mode.ts` | **Create:** active tool + History undo/redo hooks |
| `packages/pdf/src/webview/annotation-session.ts` | **Create:** listen committed events; `saveAsCopy` → host |
| `packages/pdf/src/shared/messages.ts` | Add `annotationSave` / `annotationSaveResult` / `annotationRetry` / `annotationSaveFailed` |
| `packages/pdf/src/shared/host/files.ts` | Extend `PdfFiles` with optional `hash` + `writeAtomic` |
| `packages/pdf/src/shared/atomic-write.ts` | **Create:** pure Node temp→fsync→rename |
| `packages/pdf/src/host/viewer/source.ts` | `expectWrite` / `acceptWrite` / `diskMatchesBase` watcher suppression |
| `packages/pdf/src/host/viewer/panel.ts` | Handle save messages; conflict gate; dirty flag; Keep mine / Reload |
| `packages/pdf/src/extension/plugins/pdf/files.ts` | Implement `writeAtomic` + `hash` for `file:` URIs |
| `packages/pdf/src/extension/plugins/pdfAnnotations/` | **Create:** conflict modal, failure toast + Retry |
| `packages/pdf/src/extension/plugins/catalog.ts` | Register `pdfAnnotationsPlugin` |
| `packages/pdf/src/extension/plugins/pdfToolbar/status-bar-layout.ts` | Annotate cluster in `STATUS_BAR_ORDER` after `find`, before `view` |
| `packages/pdf/src/extension/plugins/pdfToolbar/status-bar.ts` | Annotate, tool, color, undo, redo status entries |
| `packages/pdf/src/extension/plugins/pdfToolbar/annotation-picker.ts` | **Create:** toolkit and color quick picks |
| `packages/pdf/src/shared/command-ids.ts` | Annotate / tool / color / undo / redo / retry command ids |
| `packages/pdf/src/shared/view-commands.ts` | Map new commands to viewer actions |
| `packages/pdf/contributes.json` | Command palette entries and keybindings (not an editor-title or viewer-bar surface) |
| `packages/pdf/src/webview/toolbar.tsx` | **Do not** add Annotate here |
| `packages/pdf/src/webview/floating-toolbar.tsx` | **Do not** add Annotate here |
| `packages/pdf/src/webview/viewer.tsx` | Wire annotation session; Escape exits Annotate |
| `packages/pdf/docs/HANDOFF_OPENAI.md` | Un-defer annotation system for this scoped slice |
| `packages/pdf/test/unit/atomic-write.test.ts` | **Create** |
| `packages/pdf/test/unit/annotation-messages.test.ts` | **Create** |
| `packages/pdf/test/unit/view-state-annotate.test.ts` | **Create** |
| `packages/pdf/test/unit/annotation-status-bar.test.ts` | **Create:** status-bar order and annotate entry ids |
| `packages/pdf/test/unit/plugin-registration-annotations.test.ts` | **Create** |
| `packages/pdf/test/unit/page-annotation-layer.test.ts` | **Create** |
| `packages/pdf/test/unit/annotation-save-panel.test.ts` | **Create** |
| `packages/pdf/test/unit/annotation-roundtrip.test.ts` | **Create** |
| `packages/pdf/test/browser/annotations.spec.ts` | **Create** |
| Root `THIRD_PARTY_NOTICES.md` | Regenerated after dep add |

---

### Task 1: Add EmbedPDF Annotation + History dependencies

**Files:**
- Modify: `packages/pdf/package.json`
- Modify: `pnpm-lock.yaml` (via pnpm)
- Modify: `THIRD_PARTY_NOTICES.md` (via package script)

**Interfaces:**
- Consumes: existing EmbedPDF 2.15.1 pin
- Produces: importable `@embedpdf/plugin-annotation/react` and `@embedpdf/plugin-history/react` at 2.15.1

- [ ] **Step 1: Add dependencies at 2.15.1**

In `packages/pdf/package.json`, inside `"dependencies"`, add next to the other `@embedpdf/plugin-*` entries:

```json
"@embedpdf/plugin-annotation": "2.15.1",
"@embedpdf/plugin-history": "2.15.1",
```

- [ ] **Step 2: Install**

Run: `cd /workspace/lumiere && pnpm install`

Expected: lockfile updates; `node_modules/@embedpdf/plugin-annotation` and `plugin-history` resolve to 2.15.1.

- [ ] **Step 3: Regenerate third-party notices**

Run: `cd /workspace/lumiere && node packages/pdf/scripts/third-party-notices.mjs`

Expected: `THIRD_PARTY_NOTICES.md` mentions the new plugins (MIT).

- [ ] **Step 4: Commit**

```bash
git add packages/pdf/package.json pnpm-lock.yaml THIRD_PARTY_NOTICES.md
git commit -m "$(cat <<'EOF'
chore(pdf): add EmbedPDF annotation and history plugins 2.15.1

EOF
)"
```

---

### Task 2: Register History + Annotation in `viewerPlugins`

**Files:**
- Modify: `packages/pdf/src/webview/plugins.ts`
- Test: `packages/pdf/test/unit/plugin-registration-annotations.test.ts` (create)

**Interfaces:**
- Consumes: `createPluginRegistration`, existing `viewerPlugins(buffer)`
- Produces: plugins array including `HistoryPluginPackage` then `AnnotationPluginPackage` after `SelectionPluginPackage`

- [ ] **Step 1: Write the failing registration test**

Create `packages/pdf/test/unit/plugin-registration-annotations.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pluginsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/webview/plugins.ts",
);

test("viewerPlugins registers History then Annotation after Selection", () => {
  const source = readFileSync(pluginsPath, "utf8");
  assert.match(source, /@embedpdf\/plugin-history\/react/);
  assert.match(source, /@embedpdf\/plugin-annotation\/react/);
  assert.match(source, /HistoryPluginPackage/);
  assert.match(source, /AnnotationPluginPackage/);
  const selection = source.indexOf("SelectionPluginPackage");
  const history = source.indexOf("HistoryPluginPackage");
  const annotation = source.indexOf("AnnotationPluginPackage");
  assert.ok(selection > 0 && history > selection && annotation > history);
  assert.match(source, /annotationAuthor:\s*["']Lumière["']/);
  assert.match(source, /autoCommit:\s*true/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/plugin-registration-annotations.test.ts`

Expected: FAIL (imports / packages missing from `plugins.ts`).

- [ ] **Step 3: Implement registration**

Update `packages/pdf/src/webview/plugins.ts` imports and `viewerPlugins` body. Keep all existing registrations; insert History + Annotation **immediately after** `SelectionPluginPackage`:

```ts
import { AnnotationPluginPackage } from "@embedpdf/plugin-annotation/react";
import { HistoryPluginPackage } from "@embedpdf/plugin-history/react";
```

```ts
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(HistoryPluginPackage),
    createPluginRegistration(AnnotationPluginPackage, {
      annotationAuthor: "Lumière",
      autoCommit: true,
      selectAfterCreate: true,
      deactivateToolAfterCreate: false,
    }),
    createPluginRegistration(ZoomPluginPackage, {
```

(Leave DocumentManager → … → InteractionManager → Selection order unchanged; Zoom/Search/Bookmark stay after Annotation.)

- [ ] **Step 4: Run test — expect PASS**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/plugin-registration-annotations.test.ts`

Expected: PASS.

- [ ] **Step 5: Typecheck webview**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsc -p src/webview --noEmit`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/pdf/src/webview/plugins.ts packages/pdf/test/unit/plugin-registration-annotations.test.ts
git commit -m "$(cat <<'EOF'
feat(pdf): register EmbedPDF History and Annotation plugins

EOF
)"
```

---

### Task 3: Mount `AnnotationLayer` on each page

**Files:**
- Modify: `packages/pdf/src/webview/page.tsx`
- Test: `packages/pdf/test/unit/page-annotation-layer.test.ts` (create)

**Interfaces:**
- Consumes: `AnnotationLayer` from `@embedpdf/plugin-annotation/react`, `DOCUMENT_ID`, page `scale`/`pageIndex`
- Produces: annotation overlay after `PageMarks` and **before** `SelectionLayer` / `TextSelection`

- [ ] **Step 1: Write failing presence test**

Create `packages/pdf/test/unit/page-annotation-layer.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pagePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/webview/page.tsx",
);

test("Page mounts AnnotationLayer before SelectionLayer", () => {
  const source = readFileSync(pagePath, "utf8");
  assert.match(source, /AnnotationLayer/);
  const ann = source.indexOf("<AnnotationLayer");
  const sel = source.indexOf("<SelectionLayer");
  assert.ok(ann > 0 && sel > ann, "AnnotationLayer must precede SelectionLayer in JSX");
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/page-annotation-layer.test.ts`

Expected: FAIL.

- [ ] **Step 3: Mount the layer**

In `packages/pdf/src/webview/page.tsx`:

1. Add: `import { AnnotationLayer } from "@embedpdf/plugin-annotation/react";`

2. Inside `PagePointerProvider`, after `<PageMarks ... />` and before `<TextSelection ... />`:

```tsx
      <AnnotationLayer
        documentId={DOCUMENT_ID}
        pageIndex={pageIndex}
        scale={scale}
      />
```

- [ ] **Step 4: Run tests + typecheck**

Run:

```bash
cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/page-annotation-layer.test.ts && pnpm exec tsc -p src/webview --noEmit
```

Expected: PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/pdf/src/webview/page.tsx packages/pdf/test/unit/page-annotation-layer.test.ts
git commit -m "$(cat <<'EOF'
feat(pdf): mount AnnotationLayer on each page

EOF
)"
```

---

### Task 4: Shared annotate tool ids + extend `ToolMode`

**Files:**
- Create: `packages/pdf/src/shared/annotation-tools.ts`
- Modify: `packages/pdf/src/shared/view-state.ts`
- Modify: `packages/pdf/src/shared/command-ids.ts`
- Modify: `packages/pdf/src/shared/view-commands.ts`
- Test: `packages/pdf/test/unit/view-state-annotate.test.ts`

**Interfaces:**
- Consumes: existing `ToolMode`, `ViewerAction`, `VIEW_COMMAND_IDS`
- Produces:
  - `export type ToolMode = "text" | "region" | "annotate"`
  - `export type AnnotationToolId` covering the locked toolkit
  - `ANNOTATION_TOOL_IDS`, `DEFAULT_ANNOTATION_TOOL = "highlight"`
  - `ViewerAction` adds `setAnnotationTool`, `annotationUndo`, `annotationRedo`
  - Command ids: `selectAnnotateTool`, `annotationUndo`, `annotationRedo`, `annotationRetrySave`

- [ ] **Step 1: Write failing view-state tests**

Create `packages/pdf/test/unit/view-state-annotate.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseViewState,
  parseViewerAction,
} from "../../src/shared/view-state";
import { DEFAULT_VIEW_CHOICES } from "../../src/shared/view-settings";
import {
  ANNOTATION_TOOL_IDS,
  isAnnotationToolId,
} from "../../src/shared/annotation-tools";

const baseView = {
  page: 1,
  pageCount: 3,
  zoomPercent: 100,
  fit: null,
  tool: "annotate",
  canGoBack: false,
  canGoForward: true,
  readingPage: 1,
  zoom: 1,
  top: 0,
  left: 0,
  ...DEFAULT_VIEW_CHOICES,
};

test("parseViewState accepts annotate tool", () => {
  const view = parseViewState(baseView);
  assert.equal(view?.tool, "annotate");
});

test("parseViewerAction accepts setTool annotate and annotation tools", () => {
  assert.deepEqual(parseViewerAction({ action: "setTool", tool: "annotate" }), {
    action: "setTool",
    tool: "annotate",
  });
  assert.deepEqual(
    parseViewerAction({ action: "setAnnotationTool", tool: "ink" }),
    { action: "setAnnotationTool", tool: "ink" },
  );
  assert.deepEqual(parseViewerAction({ action: "annotationUndo" }), {
    action: "annotationUndo",
  });
  assert.deepEqual(parseViewerAction({ action: "annotationRedo" }), {
    action: "annotationRedo",
  });
  assert.equal(
    parseViewerAction({ action: "setAnnotationTool", tool: "link" }),
    undefined,
  );
});

test("ANNOTATION_TOOL_IDS covers the locked v1 toolkit", () => {
  for (const id of [
    "highlight",
    "underline",
    "strikeout",
    "squiggly",
    "textComment",
    "freeText",
    "ink",
    "square",
    "circle",
    "line",
    "lineArrow",
    "polygon",
    "polyline",
    "stamp",
  ] as const) {
    assert.ok(isAnnotationToolId(id));
    assert.ok(ANNOTATION_TOOL_IDS.includes(id));
  }
  assert.equal(isAnnotationToolId("link"), false);
  assert.equal(isAnnotationToolId("insertText"), false);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/view-state-annotate.test.ts`

Expected: FAIL (module missing / annotate rejected).

- [ ] **Step 3: Create `annotation-tools.ts`**

Create `packages/pdf/src/shared/annotation-tools.ts`:

```ts
/** EmbedPDF default tool ids exposed in Annotate mode (spec v1 toolkit). */
export const ANNOTATION_TOOL_IDS = [
  "highlight",
  "underline",
  "strikeout",
  "squiggly",
  "textComment",
  "freeText",
  "ink",
  "square",
  "circle",
  "line",
  "lineArrow",
  "polygon",
  "polyline",
  "stamp",
] as const;

export type AnnotationToolId = (typeof ANNOTATION_TOOL_IDS)[number];

export const DEFAULT_ANNOTATION_TOOL: AnnotationToolId = "highlight";

export const ANNOTATION_TOOL_LABELS: Record<AnnotationToolId, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "Strikeout",
  squiggly: "Squiggly",
  textComment: "Note",
  freeText: "Free text",
  ink: "Ink",
  square: "Rectangle",
  circle: "Ellipse",
  line: "Line",
  lineArrow: "Arrow",
  polygon: "Polygon",
  polyline: "Polyline",
  stamp: "Stamp",
};

export const ANNOTATION_TOOL_ICONS: Record<AnnotationToolId, string> = {
  highlight: "paintcan",
  underline: "whole-word",
  strikeout: "strike",
  squiggly: "wand",
  textComment: "comment",
  freeText: "text-size",
  ink: "edit",
  square: "symbol-ruler",
  circle: "circle-outline",
  line: "remove",
  lineArrow: "arrow-right",
  polygon: "triangle-down",
  polyline: "type-hierarchy-sub",
  stamp: "rocket",
};

export const ANNOTATION_COLOR_PRESETS = [
  "#FFE600",
  "#FF6B6B",
  "#4DABF7",
  "#51CF66",
  "#CC5DE8",
  "#212529",
] as const;

export function isAnnotationToolId(value: unknown): value is AnnotationToolId {
  return (
    typeof value === "string" &&
    (ANNOTATION_TOOL_IDS as readonly string[]).includes(value)
  );
}
```

- [ ] **Step 4: Extend `view-state.ts`**

1. Import `isAnnotationToolId`, `type AnnotationToolId` from `./annotation-tools`.

2. Replace: `export type ToolMode = "text" | "region" | "annotate";`

3. Extend `ViewerAction` simple actions with `"annotationUndo" | "annotationRedo"` and add:
   `{ action: "setAnnotationTool"; tool: AnnotationToolId }`

4. Add `"annotationUndo"` and `"annotationRedo"` to `SIMPLE_ACTIONS`.

5. In `parseViewState`:
```ts
    tool:
      tool === "region" ? "region" : tool === "annotate" ? "annotate" : "text",
```

6. Update `ACTION_PARSERS`:
```ts
  setTool: ({ tool }) =>
    tool === "text" || tool === "region" || tool === "annotate"
      ? { action: "setTool", tool }
      : undefined,
  setAnnotationTool: ({ tool }) =>
    isAnnotationToolId(tool)
      ? { action: "setAnnotationTool", tool }
      : undefined,
```

- [ ] **Step 5: Extend command ids and view-commands**

In `VIEW_COMMAND_IDS` add:
```ts
  selectAnnotateTool: "lumiere.pdf.selectAnnotateTool",
  annotationUndo: "lumiere.pdf.annotationUndo",
  annotationRedo: "lumiere.pdf.annotationRedo",
  annotationRetrySave: "lumiere.pdf.annotationRetrySave",
```

In `VIEW_ACTION_COMMANDS` after region tool:
```ts
  {
    id: VIEW_COMMAND_IDS.selectAnnotateTool,
    action: { action: "setTool", tool: "annotate" },
  },
  simple(VIEW_COMMAND_IDS.annotationUndo, "annotationUndo"),
  simple(VIEW_COMMAND_IDS.annotationRedo, "annotationRedo"),
```

- [ ] **Step 6: Run tests**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/view-state-annotate.test.ts && pnpm typecheck`

Expected: PASS / typecheck clean for shared changes.

- [ ] **Step 7: Commit**

```bash
git add packages/pdf/src/shared/annotation-tools.ts packages/pdf/src/shared/view-state.ts packages/pdf/src/shared/command-ids.ts packages/pdf/src/shared/view-commands.ts packages/pdf/test/unit/view-state-annotate.test.ts
git commit -m "$(cat <<'EOF'
feat(pdf): add Annotate tool mode and annotation tool ids

EOF
)"
```

---

### Task 5: Wire Annotate mode in the webview

**Files:**
- Create: `packages/pdf/src/webview/annotation-mode.ts`
- Modify: `packages/pdf/src/webview/tool-mode.ts`
- Modify: `packages/pdf/src/webview/view-sync.ts`
- Modify: `packages/pdf/src/webview/viewer.tsx`

**Interfaces:**
- Consumes: `useAnnotationCapability`, `useHistoryCapability`, `ToolMode`, `AnnotationToolId`
- Produces: `useAnnotationMode(documentId)` → `{ annotationTool, setAnnotationTool, setColor, undo, redo, canUndo, canRedo }`; `useToolMode` returns `"annotate"`; Escape / leaving annotate calls `setActiveTool(null)`

- [ ] **Step 1: Create `annotation-mode.ts`**

```tsx
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useHistoryCapability } from "@embedpdf/plugin-history/react";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ANNOTATION_TOOL,
  type AnnotationToolId,
  isAnnotationToolId,
} from "../shared/annotation-tools";

const HISTORY_TOPIC = "annotations";

/** Active EmbedPDF annotation tool + History undo/redo for one document. */
export function useAnnotationMode(documentId: string): {
  annotationTool: AnnotationToolId | null;
  setAnnotationTool: (tool: AnnotationToolId | null) => void;
  setColor: (color: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
} {
  const { provides: annots } = useAnnotationCapability();
  const { provides: history } = useHistoryCapability();
  const [annotationTool, setAnnotationToolState] =
    useState<AnnotationToolId | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!annots) return;
    return annots.onActiveToolChange(({ documentId: id, tool }) => {
      if (id !== documentId) return;
      const next = tool?.id;
      setAnnotationToolState(isAnnotationToolId(next) ? next : null);
    });
  }, [annots, documentId]);

  useEffect(() => {
    if (!history) return;
    const scope = history.forDocument(documentId);
    const refresh = (): void => {
      setCanUndo(scope.canUndo(HISTORY_TOPIC) || scope.canUndo());
      setCanRedo(scope.canRedo(HISTORY_TOPIC) || scope.canRedo());
    };
    refresh();
    return scope.onHistoryChange(() => refresh());
  }, [history, documentId]);

  const setAnnotationTool = useCallback(
    (tool: AnnotationToolId | null) => {
      annots?.forDocument(documentId).setActiveTool(tool);
      setAnnotationToolState(tool);
    },
    [annots, documentId],
  );

  const setColor = useCallback(
    (color: string) => {
      const id = annotationTool ?? DEFAULT_ANNOTATION_TOOL;
      annots?.setToolDefaults(id, {
        strokeColor: color,
        color,
        opacity: 0.5,
      } as never);
    },
    [annots, annotationTool],
  );

  const undo = useCallback(() => {
    history?.forDocument(documentId).undo(HISTORY_TOPIC);
  }, [history, documentId]);

  const redo = useCallback(() => {
    history?.forDocument(documentId).redo(HISTORY_TOPIC);
  }, [history, documentId]);

  return {
    annotationTool,
    setAnnotationTool,
    setColor,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
```

- [ ] **Step 2: Update `tool-mode.ts`**

Track annotate as local state. On `setTool("annotate")`: clear selection, `activateDefaultMode()`, `setActiveTool("highlight")`, set annotate true. On any other tool: `setActiveTool(null)`, annotate false, then existing region/text behavior.

Return `tool: annotate ? "annotate" : state.activeMode === REGION_MODE ? "region" : "text"`.

- [ ] **Step 3: Wire actions in `view-sync.ts` / `viewer.tsx`**

Handle `setAnnotationTool`, `annotationUndo`, `annotationRedo` in the action map. Pass hooks from `useAnnotationMode(DOCUMENT_ID)` into `useViewActions`. Do not pass them into `toolbar.tsx` or `floating-toolbar.tsx`. Task 10 reports `annotationTool` and the History undo/redo flags on the view state the status bar reads, and handles `setAnnotationColor`.

In Escape key handler: if `tool === "annotate"`, `setTool("text")` and return (spec: Escape exits Annotate).

- [ ] **Step 4: Typecheck**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsc -p src/webview --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/pdf/src/webview/annotation-mode.ts packages/pdf/src/webview/tool-mode.ts packages/pdf/src/webview/view-sync.ts packages/pdf/src/webview/viewer.tsx
git commit -m "$(cat <<'EOF'
feat(pdf): wire Annotate mode to EmbedPDF annotation tools

EOF
)"
```

---

### Task 6: Atomic writer + extended `PdfFiles` contract

**Files:**
- Create: `packages/pdf/src/shared/atomic-write.ts`
- Modify: `packages/pdf/src/shared/host/files.ts`
- Test: `packages/pdf/test/unit/atomic-write.test.ts`

**Interfaces:**
- Consumes: Node `fs/promises`, `crypto`
- Produces: `writeAtomicFile(targetPath, bytes) => Promise<{ sha256 }>`; `PdfFiles.hash?` / `PdfFiles.writeAtomic?`

- [ ] **Step 1: Write failing atomic-write tests**

Create `packages/pdf/test/unit/atomic-write.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeAtomicFile } from "../../src/shared/atomic-write";

test("writeAtomicFile replaces target and returns sha256", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-pdf-atomic-"));
  const target = path.join(dir, "doc.pdf");
  await writeFile(target, Buffer.from("%PDF-old"));
  const next = Buffer.from("%PDF-annotated-bytes");
  const { sha256 } = await writeAtomicFile(target, next);
  assert.equal(sha256, createHash("sha256").update(next).digest("hex"));
  assert.equal(await readFile(target, "utf8"), "%PDF-annotated-bytes");
  assert.deepEqual(await readdir(dir), ["doc.pdf"]);
});

test("writeAtomicFile rejects when directory is missing", async () => {
  await assert.rejects(() =>
    writeAtomicFile(path.join("/no/such/dir", "x.pdf"), Buffer.from("x")),
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/atomic-write.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Implement writer + PdfFiles**

Create `packages/pdf/src/shared/atomic-write.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import path from "node:path";

/** Same-directory temp → fsync → rename over `targetPath`. */
export async function writeAtomicFile(
  targetPath: string,
  bytes: Uint8Array,
): Promise<{ sha256: string }> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const temp = path.join(
    dir,
    `.${base}.${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    const handle = await open(temp, "w");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, targetPath);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
  return { sha256 };
}
```

Update `packages/pdf/src/shared/host/files.ts`:

```ts
/** The PDF files the viewer shows: reading, watching, naming, and optional in-place replace. */
export interface PdfFiles {
  read(uri: string): Promise<Uint8Array>;
  watch(uri: string, onChange: () => void): () => void;
  displayPath(uri: string): string;
  /** SHA-256 hex of the file on disk. */
  hash?(uri: string): Promise<string>;
  /**
   * Atomically replace the file. Hosts that cannot (non-`file` schemes) omit this;
   * annotation saves then fail with a clear error (no sidecar fallback).
   */
  writeAtomic?(uri: string, bytes: Uint8Array): Promise<{ sha256: string }>;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/atomic-write.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pdf/src/shared/atomic-write.ts packages/pdf/src/shared/host/files.ts packages/pdf/test/unit/atomic-write.test.ts
git commit -m "$(cat <<'EOF'
feat(pdf): add atomic file replace helper for annotation saves

EOF
)"
```

---

### Task 7: Save messages + webview `annotation-session`

**Files:**
- Modify: `packages/pdf/src/shared/messages.ts`
- Create: `packages/pdf/src/webview/annotation-session.ts`
- Modify: `packages/pdf/src/webview/host-messages.ts`
- Modify: `packages/pdf/src/webview/engine.tsx` and/or `viewer.tsx`
- Modify: `packages/pdf/src/host/viewer/panel.ts` (include `sha256` on `load`)
- Test: `packages/pdf/test/unit/annotation-messages.test.ts`

**Interfaces:**
- Consumes: `onAnnotationEvent` with `committed === true`, `engine.saveAsCopy(doc)`, `postToHost`
- Produces:

Viewer → host:
```ts
| { type: "annotationSave"; load: number; baseSha256: string; data: ArrayBuffer }
| { type: "annotationSaveFailed"; load: number; message: string }
```

Host → viewer:
```ts
| { type: "annotationSaveResult"; load: number; ok: true; sha256: string }
| { type: "annotationSaveResult"; load: number; ok: false; reason: "conflict" | "error"; message: string }
| { type: "annotationRetry"; load: number }
```

Also extend `load` HostMessage with `sha256: string`.

- [ ] **Step 1: Write message parse tests**

Create `packages/pdf/test/unit/annotation-messages.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseViewerMessage } from "../../src/shared/messages";

test("parseViewerMessage accepts annotationSave with ArrayBuffer", () => {
  const data = new Uint8Array([1, 2, 3]).buffer;
  const parsed = parseViewerMessage({
    type: "annotationSave",
    load: 2,
    baseSha256: "abc",
    data,
  });
  assert.equal(parsed?.type, "annotationSave");
  if (parsed?.type === "annotationSave") {
    assert.equal(parsed.load, 2);
    assert.equal(parsed.baseSha256, "abc");
    assert.equal(parsed.data.byteLength, 3);
  }
});

test("parseViewerMessage rejects annotationSave without hash", () => {
  assert.equal(
    parseViewerMessage({
      type: "annotationSave",
      load: 1,
      data: new ArrayBuffer(1),
    }),
    undefined,
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/annotation-messages.test.ts`

Expected: FAIL.

- [ ] **Step 3: Extend `messages.ts`**

Add the union members. Parsers for `annotationSave`:

- `load`: safe integer ≥ 1
- `baseSha256`: non-empty string ≤ 128
- `data`: `ArrayBuffer` or `ArrayBufferView` → standalone `ArrayBuffer`, max 512_000_000 bytes

`annotationSaveFailed`: `load` + `message` string ≤ 2000.

Document the flow in the file header comment.

- [ ] **Step 4: Implement `useAnnotationSaveSession`**

Create `packages/pdf/src/webview/annotation-session.ts`:

```tsx
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useEffect, useRef } from "react";
import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import { postToHost } from "./host";

/**
 * On each committed annotation mutation, saveAsCopy and ask the host to
 * overwrite the open file. Serializes overlapping saves.
 */
export function useAnnotationSaveSession(options: {
  documentId: string;
  load: number;
  baseSha256: string | undefined;
  engine: PdfEngine | undefined;
  document: PdfDocumentObject | undefined;
}): { retry: () => void } {
  const { provides: annots } = useAnnotationCapability();
  const latest = useRef(options);
  latest.current = options;
  const chain = useRef(Promise.resolve());

  const enqueueSave = (): void => {
    chain.current = chain.current.then(async () => {
      const { engine, document, load, baseSha256 } = latest.current;
      if (!engine || !document || !baseSha256) return;
      try {
        const data = await engine.saveAsCopy(document).toPromise();
        postToHost({ type: "annotationSave", load, baseSha256, data });
      } catch (error) {
        postToHost({
          type: "annotationSaveFailed",
          load,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  };

  useEffect(() => {
    if (!annots) return;
    return annots.onAnnotationEvent((event) => {
      if (
        event.type === "loaded" ||
        event.documentId !== latest.current.documentId ||
        !event.committed
      ) {
        return;
      }
      enqueueSave();
    });
  }, [annots]);

  return { retry: enqueueSave };
}
```

Wire the hook where `engine` + `document` exist (`DocumentContent` in `engine.tsx`). Store `load` + `sha256` from host `load` messages (extend viewer load state). On host `annotationRetry`, call `retry()`. On `annotationSaveResult` with `ok: true`, update local `baseSha256` to `sha256`.

- [ ] **Step 5: Pass sha256 on load from panel**

In `PdfViewerPanel.load()`:

```ts
    this.post({
      type: "load",
      load: this.loads,
      ...this.webview.deliver(bytes.data, this.loads),
      settings: this.settings,
      sha256: bytes.sha256,
      ...(this.position ? { position: this.position } : {}),
    });
```

Update `HostMessage` `load` type and webview load receiver accordingly.

- [ ] **Step 6: Run message tests + typecheck**

Run:

```bash
cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/annotation-messages.test.ts && pnpm exec tsc -p src/webview --noEmit && pnpm exec tsc -p src/host --noEmit
```

Expected: PASS / exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/pdf/src/shared/messages.ts packages/pdf/src/webview/annotation-session.ts packages/pdf/src/webview/engine.tsx packages/pdf/src/webview/viewer.tsx packages/pdf/src/webview/host-messages.ts packages/pdf/src/webview/load.ts packages/pdf/src/host/viewer/panel.ts packages/pdf/test/unit/annotation-messages.test.ts
git commit -m "$(cat <<'EOF'
feat(pdf): saveAsCopy session posts committed annotation bytes to host

EOF
)"
```

---

### Task 8: Host save pipeline with watcher suppression

**Files:**
- Modify: `packages/pdf/src/host/viewer/source.ts`
- Modify: `packages/pdf/src/host/viewer/panel.ts`
- Modify: `packages/pdf/src/extension/plugins/pdf/files.ts`
- Create: `packages/pdf/test/unit/annotation-save-panel.test.ts`

**Interfaces:**
- Consumes: `PdfFiles.writeAtomic`, `PdfFiles.hash`, `annotationSave`
- Produces: successful overwrite updates `source.sha256`, suppresses one watcher reload, posts `annotationSaveResult ok`; mismatch → conflict (Task 9); never reloads viewer on self-write

- [ ] **Step 1: Extend `PdfSource`**

Add:

```ts
  private expectedWrite: string | undefined;

  expectWrite(sha256: string): void {
    this.expectedWrite = sha256;
  }

  async diskMatchesBase(): Promise<boolean> {
    if (!this.sha256 || !this.files.hash) return true;
    try {
      return (await this.files.hash(this.uri)) === this.sha256;
    } catch {
      return false;
    }
  }

  acceptWrite(sha256: string): void {
    this.sha256 = sha256;
    this.expectedWrite = sha256;
  }
```

Change the watch callback to debounce into `onWatchedChange` that hashes disk; if hash === `expectedWrite`, clear expectation / update sha256 and **return without** `events.changed()`.

- [ ] **Step 2: Implement VS Code `hash` / `writeAtomic`**

In `packages/pdf/src/extension/plugins/pdf/files.ts`:

```ts
import { createHash } from "node:crypto";
import * as vscode from "vscode";
import type { PdfFiles } from "../../../shared/host";
import { writeAtomicFile } from "../../../shared/atomic-write";

export const vscodePdfFiles: PdfFiles = {
  read: (uri) =>
    Promise.resolve(vscode.workspace.fs.readFile(vscode.Uri.parse(uri))),
  watch: (uri, onChange) => watchFile(vscode.Uri.parse(uri), onChange),
  displayPath: (uri) => displayPath(vscode.Uri.parse(uri)),
  hash: async (uri) => {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
    return createHash("sha256").update(bytes).digest("hex");
  },
  writeAtomic: async (uri, bytes) => {
    const parsed = vscode.Uri.parse(uri);
    if (parsed.scheme !== "file") {
      throw new Error("In-place annotation save requires a local file URI");
    }
    return writeAtomicFile(parsed.fsPath, bytes);
  },
};
```

- [ ] **Step 3: Handle `annotationSave` on the panel**

Ownership: **panel performs IO**; plugin (Task 9) owns prompts.

Add `annotationDirty: "clean" | "saving" | "failed"`, cache `lastSaveBytes` for Keep mine / Retry, and:

```ts
  private async onAnnotationSave(
    message: Extract<ViewerMessage, { type: "annotationSave" }>,
  ): Promise<void> {
    if (!this.isCurrentLoad(message.load)) return;
    this.lastSaveBytes = message.data;
    if (message.baseSha256 !== this.source.sha256) {
      this.fireAnnotationConflict({ data: message.data, load: message.load });
      this.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: false,
        reason: "conflict",
        message: "The PDF changed since this editor loaded it.",
      });
      return;
    }
    if (!this.host.files.writeAtomic) {
      this.annotationDirty = "failed";
      this.host.error("This host cannot overwrite PDF files in place.");
      this.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: false,
        reason: "error",
        message: "writeAtomic is unavailable",
      });
      return;
    }
    if (!(await this.source.diskMatchesBase())) {
      this.fireAnnotationConflict({ data: message.data, load: message.load });
      this.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: false,
        reason: "conflict",
        message: "The PDF was modified on disk.",
      });
      return;
    }
    this.annotationDirty = "saving";
    try {
      const { sha256 } = await this.host.files.writeAtomic(
        this.fileUri,
        new Uint8Array(message.data),
      );
      this.source.acceptWrite(sha256);
      this.annotationDirty = "clean";
      this.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: true,
        sha256,
      });
    } catch (error) {
      this.annotationDirty = "failed";
      const text = error instanceof Error ? error.message : String(error);
      this.host.error(`Could not save PDF annotations: ${text}`);
      this.fireAnnotationSaveFailed(text);
      this.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: false,
        reason: "error",
        message: text,
      });
    }
  }
```

Also: `reloadFromDisk()`, `keepMine(data, load)`, `postAnnotationRetry()` helpers for Task 9.

Update fake `PdfFiles` in existing panel tests with optional no-op stubs so they still typecheck.

- [ ] **Step 4: Unit test happy path**

Create `packages/pdf/test/unit/annotation-save-panel.test.ts` using the `open()` harness from `viewer-panel.test.ts`:

1. Fake `writeAtomic` + `hash` returning the base sha
2. `ready` → load
3. Post `annotationSave` with matching `baseSha256`
4. Assert `writeAtomic` once, `annotationSaveResult.ok === true`
5. Trigger watch callback; assert no extra `load` message

- [ ] **Step 5: Run tests**

Run:

```bash
cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/annotation-save-panel.test.ts test/unit/viewer-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/pdf/src/host/viewer/source.ts packages/pdf/src/host/viewer/panel.ts packages/pdf/src/extension/plugins/pdf/files.ts packages/pdf/test/unit/annotation-save-panel.test.ts packages/pdf/test/unit/viewer-panel.test.ts
git commit -m "$(cat <<'EOF'
feat(pdf): atomically overwrite open PDF on committed annotations

EOF
)"
```

---

### Task 9: Conflict UI (Reload vs Keep mine) + Retry

**Files:**
- Create: `packages/pdf/src/extension/plugins/pdfAnnotations/manifest.ts`
- Create: `packages/pdf/src/extension/plugins/pdfAnnotations/plugin.ts`
- Modify: `packages/pdf/src/extension/plugins/catalog.ts`
- Modify: `packages/pdf/src/host/viewer/panel.ts` (emitters already from Task 8)
- Modify: `packages/pdf/contributes.json` (Retry command entry)

**Interfaces:**
- Consumes: `onAnnotationConflict`, `onAnnotationSaveFailed`, `reloadFromDisk`, `keepMine`, `postAnnotationRetry`
- Produces: modal Reload | Keep mine; error toast with Retry → `annotationRetry` → webview re-`saveAsCopy`

- [ ] **Step 1: Panel public APIs (if not finished in Task 8)**

```ts
  async reloadFromDisk(): Promise<void> {
    await this.load();
  }

  async keepMine(data: ArrayBuffer, load: number): Promise<void> {
    if (!this.isCurrentLoad(load) || !this.host.files.writeAtomic) return;
    const { sha256 } = await this.host.files.writeAtomic(
      this.fileUri,
      new Uint8Array(data),
    );
    this.source.acceptWrite(sha256);
    this.annotationDirty = "clean";
    this.post({ type: "annotationSaveResult", load, ok: true, sha256 });
  }

  postAnnotationRetry(): void {
    this.post({ type: "annotationRetry", load: this.loads });
  }
```

- [ ] **Step 2: Create `pdfAnnotations` plugin**

`manifest.ts`:

```ts
import { defineManifest } from "../manifest";

export default defineManifest({
  id: "pdfAnnotations",
  title: "PDF Annotations",
  capabilities: ["commands"],
});
```

`plugin.ts`:

```ts
import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import { VIEW_COMMAND_IDS } from "../../../shared/command-ids";
import manifest from "./manifest";
import type {} from "../services";

export const pdfAnnotationsPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels", "extensionContext"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;

    const attach = (panel: (typeof panels.all)[number]): void => {
      ctx.own(
        panel.onAnnotationConflict(async (payload) => {
          const choice = await vscode.window.showWarningMessage(
            "This PDF changed on disk while you were annotating.",
            { modal: true },
            "Reload",
            "Keep mine",
          );
          if (choice === "Reload") {
            await panel.reloadFromDisk();
          } else if (choice === "Keep mine") {
            await panel.keepMine(payload.data, payload.load);
          }
        }),
        `conflict:${panel.viewId}`,
      );
      ctx.own(
        panel.onAnnotationSaveFailed(async () => {
          const choice = await vscode.window.showErrorMessage(
            "Could not save PDF annotations.",
            "Retry",
          );
          if (choice === "Retry") {
            panel.postAnnotationRetry();
          }
        }),
        `fail:${panel.viewId}`,
      );
    };

    for (const panel of panels.all) attach(panel);
    ctx.own(
      panels.onDidOpen((panel) => attach(panel)),
      "open listener",
    );

    ctx.own(
      vscode.commands.registerCommand(
        VIEW_COMMAND_IDS.annotationRetrySave,
        () => panels.active?.postAnnotationRetry(),
      ),
      "retry command",
    );
  },
};
```

Adapt emitter names to whatever Task 8 exposed (`Emitter` pattern like `onDidChange`). Ensure `handle("annotationSave")` is **not** also registered here — panel owns IO.

- [ ] **Step 3: Register in catalog**

In `packages/pdf/src/extension/plugins/catalog.ts`, import `pdfAnnotationsPlugin` and add it to the `plugins` array after `pdfPlugin` (before or after `pdfRegions` is fine).

- [ ] **Step 4: Unit-test conflict branch**

In `annotation-save-panel.test.ts`: when `hash()` returns a different digest than `source.sha256`, `writeAtomic` is not called and conflict emitter fires.

- [ ] **Step 5: Commit**

```bash
git add packages/pdf/src/extension/plugins/pdfAnnotations packages/pdf/src/extension/plugins/catalog.ts packages/pdf/src/host/viewer/panel.ts packages/pdf/test/unit/annotation-save-panel.test.ts packages/pdf/contributes.json
git commit -m "$(cat <<'EOF'
feat(pdf): Reload vs Keep mine on annotation save conflicts

EOF
)"
```

---

### Task 10: Annotate controls on the status bar

**Files:**
- Modify: `packages/pdf/src/extension/plugins/pdfToolbar/status-bar-layout.ts`
- Modify: `packages/pdf/src/extension/plugins/pdfToolbar/status-bar.ts`
- Create: `packages/pdf/src/extension/plugins/pdfToolbar/annotation-picker.ts`
- Modify: `packages/pdf/src/shared/view-state.ts` (report fields + `setAnnotationColor`)
- Modify: `packages/pdf/src/shared/command-ids.ts`
- Modify: `packages/pdf/src/webview/view-sync.ts` (report fields; handle `setAnnotationColor`)
- Modify: `packages/pdf/src/webview/annotation-mode.ts` (stamp default only, if the stamp tool needs an image)
- Test: `packages/pdf/test/unit/annotation-status-bar.test.ts` (create)
- Test: `packages/pdf/test/unit/view-state-annotate.test.ts` (extend)

Do not modify `toolbar.tsx`, `floating-toolbar.tsx`, or `styles/toolbar.css` for this UI. Do not create `annotation-toolbar.tsx` or an in-viewer annotation bar.

**Interfaces:**
- Consumes: view `tool`, `annotationTool`, `canAnnotationUndo`, `canAnnotationRedo`; `ANNOTATION_TOOL_IDS`; `ANNOTATION_COLOR_PRESETS`
- Produces: status-bar entries `annotate`, `annotationTool`, `annotationColor`, `annotationUndo`, `annotationRedo`; toolkit and color quick picks; commands `lumiere.pdf.toggleAnnotateTool`, `lumiere.pdf.pickAnnotationTool`, `lumiere.pdf.pickAnnotationColor`

- [ ] **Step 1: Write a failing status-bar order test**

Create `packages/pdf/test/unit/annotation-status-bar.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { STATUS_BAR_ORDER } from "../../src/extension/plugins/pdfToolbar/status-bar-layout";

const ANNOTATE_CLUSTER = [
  "annotate",
  "annotationTool",
  "annotationColor",
  "annotationUndo",
  "annotationRedo",
] as const;

test("annotate cluster sits after find and before view", () => {
  const find = STATUS_BAR_ORDER.indexOf("find");
  const view = STATUS_BAR_ORDER.indexOf("view");
  const indexes = ANNOTATE_CLUSTER.map((id) => STATUS_BAR_ORDER.indexOf(id));
  for (const index of indexes) {
    assert.ok(index > find, String(index));
    assert.ok(index < view, String(index));
  }
  const sorted = [...indexes].sort((a, b) => a - b);
  assert.deepEqual(indexes, sorted);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/annotation-status-bar.test.ts`

Expected: FAIL (`annotate` is not in `STATUS_BAR_ORDER` yet).

- [ ] **Step 3: Extend the view report**

In `view-state.ts`:

1. Add optional `annotationTool?: AnnotationToolId | null`, `canAnnotationUndo?: boolean`, and `canAnnotationRedo?: boolean` on `ViewState`.
2. In `parseViewState`, copy `annotationTool` when `isAnnotationToolId` or the value is `null`, and copy the undo/redo flags only when they are booleans.
3. Add viewer action `{ action: "setAnnotationColor"; color: string }`. Accept `color` only when it is one of `ANNOTATION_COLOR_PRESETS`.

Extend `view-state-annotate.test.ts` with a case that accepts `setAnnotationColor` of `#FFE600` and rejects `"red"`.

In `view-sync.ts`, put those three fields on the reported view from `useAnnotationMode`, and handle `setAnnotationColor` by calling `setColor`.

- [ ] **Step 4: Status bar entries**

In `status-bar-layout.ts`, add the five ids to `StatusBarEntryId` and insert them in `STATUS_BAR_ORDER` immediately after `find` and before `view`. Leave history and page-colors entries where they already are. Page colors stays near `view`, left of page and zoom.

In `status-bar.ts`, add:

- `annotate` — `$(edit) Annotate`, or `$(edit) Annotating` while `tool === "annotate"`. Command `toggleAnnotateTool`. Shown whenever other PDF status entries are shown (status-bar mode).
- `annotationTool` — label of the active tool, command `pickAnnotationTool`, shown only while annotating.
- `annotationColor` — `$(symbol-color) Color`, command `pickAnnotationColor`, shown only while annotating.
- `annotationUndo` / `annotationRedo` — icon buttons, shown only while annotating, and they follow `lumiere.pdf.toolbar.statusBarButtons` the same way other optional buttons do. Clear the command when `canAnnotationUndo` / `canAnnotationRedo` is false.

Add `toggleAnnotateTool`, `pickAnnotationTool`, and `pickAnnotationColor` to `VIEW_COMMAND_IDS` (`lumiere.pdf.toggleAnnotateTool`, `lumiere.pdf.pickAnnotationTool`, `lumiere.pdf.pickAnnotationColor`). `toggleAnnotate`: if the active panel's tool is `annotate`, send `setTool` `text`; otherwise send `setTool` `annotate`.

- [ ] **Step 5: Quick picks**

Create `annotation-picker.ts`:

- `pickAnnotationTool`: if the panel is not annotating, enter Annotate, then `showQuickPick` over `ANNOTATION_TOOL_IDS` using `ANNOTATION_TOOL_LABELS` and `ANNOTATION_TOOL_ICONS`. On a choice, send `setAnnotationTool`.
- `pickAnnotationColor`: `showQuickPick` over `ANNOTATION_COLOR_PRESETS`. On a choice, send `{ action: "setAnnotationColor", color }`.

Register `toggleAnnotateTool`, `pickAnnotationTool`, and `pickAnnotationColor` from one plugin (`pdfToolbar`, unless `pdfAnnotations` already owns annotation commands — one owner only).

If the stamp tool is inert without an image, add `packages/pdf/src/webview/assets/stamp.png` (a tiny PNG) and, when the stamp tool becomes active, call `setToolDefaults("stamp", { imageSrc: stampUrl })` once from `annotation-mode.ts`.

- [ ] **Step 6: Leave viewer bars alone**

Do not mount annotation controls in `toolbar.tsx`, `floating-toolbar.tsx`, or `viewer.tsx`. If an `AnnotationToolkit`, an Annotate button on the slim bar, or an in-viewer annotation bar is already present, delete that surface in this task. The status bar and the command palette replace it. A stand-alone slim bar keeps its other PDF controls and does not gain an Annotate toolkit.

- [ ] **Step 7: Run tests**

Run:

```bash
cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/annotation-status-bar.test.ts test/unit/view-state-annotate.test.ts test/unit/status-bar-layout.test.ts && pnpm exec tsc -p src/extension --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/pdf/src/extension/plugins/pdfToolbar/status-bar-layout.ts packages/pdf/src/extension/plugins/pdfToolbar/status-bar.ts packages/pdf/src/extension/plugins/pdfToolbar/annotation-picker.ts packages/pdf/src/shared/view-state.ts packages/pdf/src/shared/command-ids.ts packages/pdf/src/webview/view-sync.ts packages/pdf/src/webview/annotation-mode.ts packages/pdf/test/unit/annotation-status-bar.test.ts packages/pdf/test/unit/view-state-annotate.test.ts
git commit -m "$(cat <<'EOF'
feat(pdf): Annotate toolkit and History undo/redo on the status bar

EOF
)"
```

---

### Task 11: Command palette (commands and keybindings)

**Files:**
- Modify: `packages/pdf/contributes.json`
- Modify: `packages/pdf/src/shared/command-ids.ts` (only if Task 10 left an id out)
- Possibly root `package.json` via `pnpm contributions`
- Test: `packages/pdf/test/unit/identity/contribution-parity.test.ts`

**Interfaces:**
- Consumes: command ids from Tasks 4 and 10, plus `annotationRetrySave` from Task 9
- Produces: command-palette entries and the Annotate keybinding

- [ ] **Step 1: Add command contributions**

Category `PDF`, each visible in the command palette when `activeCustomEditorId == 'lumiere.pdf.viewer'` (match sibling PDF commands):

- `lumiere.pdf.selectAnnotateTool` — "Annotate" (enters Annotate mode)
- `lumiere.pdf.toggleAnnotateTool` — "Toggle Annotate"
- `lumiere.pdf.pickAnnotationTool` — "Annotation Tool…"
- `lumiere.pdf.pickAnnotationColor` — "Annotation Color…"
- `lumiere.pdf.annotationUndo` — "Undo Annotation"
- `lumiere.pdf.annotationRedo` — "Redo Annotation"
- `lumiere.pdf.annotationRetrySave` — "Retry Annotation Save"

Do not add these commands to `editor/title`, `view/title`, or a webview toolbar menu.

Keybinding: `ctrl+alt+a` (mac `cmd+ctrl+a`) runs Toggle Annotate. Do not bind History undo/redo to workbench Undo (`cmd+z` / `ctrl+z`).

- [ ] **Step 2: Regenerate merged contributions**

Run: `cd /workspace/lumiere && pnpm contributions`

Expected: root contributes updated.

- [ ] **Step 3: Run parity test**

Run: `cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/identity/contribution-parity.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/pdf/contributes.json packages/pdf/src/shared/command-ids.ts package.json
git commit -m "$(cat <<'EOF'
feat(pdf): contribute Annotate commands for the command palette

EOF
)"
```

---

### Task 12: Browser + engine round-trip tests

**Files:**
- Create: `packages/pdf/test/browser/annotations.spec.ts`
- Create: `packages/pdf/test/unit/annotation-roundtrip.test.ts`
- Possibly modify: `packages/pdf/test/browser/viewer-support.ts`

**Interfaces:**
- Consumes: Playwright harness; EmbedPDF engine + wasm for round-trip
- Produces: Annotate mode / Escape coverage; highlight mark appears; undo clears in-session; save bytes reopen with Highlight subtype

- [ ] **Step 1: Browser spec**

Create `packages/pdf/test/browser/annotations.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { open, sendAction, pagePoint, lastView, TEXT_MIDLINE } from "./viewer-support";

test("Annotate mode has no viewer bar and Escape returns to text", async ({
  page,
}) => {
  await open(page);
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "annotate" });
  await expect(
    page.getByRole("group", { name: "PDF annotation tools" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("toolbar", { name: "PDF annotation bar" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "text" });
});

test("highlight tool can mark text", async ({ page }) => {
  await open(page);
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await sendAction(page, { action: "setAnnotationTool", tool: "highlight" });
  const at = await pagePoint(page, 1);
  await page.mouse.move(...at(74, TEXT_MIDLINE));
  await page.mouse.down();
  await page.mouse.move(...at(205, TEXT_MIDLINE));
  await page.mouse.up();
  // Assert at least one annotation overlay node appeared; adjust selector
  // after a headed inspect of AnnotationLayer DOM if needed.
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document.querySelectorAll(
            "[data-annotation-id], .annotation-layer svg, .annotation-layer canvas",
          ).length,
      ),
    )
    .toBeGreaterThan(0);
});
```

Add an undo test: after highlight, `sendAction({ action: "annotationUndo" })`, mark count returns to baseline.

- [ ] **Step 2: Engine round-trip unit test**

Create `packages/pdf/test/unit/annotation-roundtrip.test.ts` modeled on `/workspace/plans/pdf-annotations-prototype/proto.cjs`:

1. Boot `@embedpdf/engines` + shipped `pdfium.wasm`
2. Open a small fixture from `packages/pdf/test/fixtures`
3. `createPageAnnotation` HIGHLIGHT → `saveAsCopy` → `writeAtomicFile` to temp → reopen → `getPageAnnotations` includes subtype Highlight

- [ ] **Step 3: Run tests**

Run:

```bash
cd /workspace/lumiere/packages/pdf && pnpm exec tsx --test test/unit/annotation-roundtrip.test.ts && pnpm test:browser -- test/browser/annotations.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/pdf/test/browser/annotations.spec.ts packages/pdf/test/unit/annotation-roundtrip.test.ts packages/pdf/test/browser/viewer-support.ts
git commit -m "$(cat <<'EOF'
test(pdf): browser Annotate mode and annotation round-trip save

EOF
)"
```

---

### Task 13: Docs un-defer + package check

**Files:**
- Modify: `packages/pdf/docs/HANDOFF_OPENAI.md`

- [ ] **Step 1: Update HANDOFF**

Replace the “whole PDF annotation system is deferred” bullet with:

```markdown
- PDF annotations (direct-to-PDF, EmbedPDF Annotation + History, UI-only) follow
  `docs/superpowers/plans/2026-10-30-pdf-annotations-direct-to-pdf.md`.
  Still out of scope: MCP write tools, sidecar, XFDF, Export Annotated Copy,
  workbench Undo bridge, PencilKit/`packages/ink`.
```

- [ ] **Step 2: Run package checks**

Run: `cd /workspace/lumiere/packages/pdf && pnpm typecheck && pnpm test`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/pdf/docs/HANDOFF_OPENAI.md
git commit -m "$(cat <<'EOF'
docs(pdf): un-defer direct-to-PDF annotations for UI slice

EOF
)"
```

---

### Task 14: Final verification gate

**Files:** none new

- [ ] **Step 1: Full pdf verification**

Run:

```bash
cd /workspace/lumiere/packages/pdf && pnpm typecheck && pnpm test && pnpm test:browser -- test/browser/annotations.spec.ts test/browser/tool-mode.spec.ts test/browser/toolbar.spec.ts
```

Expected: all PASS. Escape still leaves Annotate mode. `toolbar.spec.ts` still passes, and the slim bar does not gain an Annotate control.

- [ ] **Step 2: Contributions / format**

Run: `cd /workspace/lumiere && pnpm contributions --check` (if contributes touched) and format touched files.

Expected: clean.

- [ ] **Step 3: Commit fixes only if needed**

```bash
git status
# if fixes:
git add -u && git commit -m "fix(pdf): annotation plan verification follow-ups"
```

---

## Spec coverage checklist

| Spec requirement | Task(s) |
| --- | --- |
| Direct-to-PDF, no sidecar | 6–9; Global Constraints |
| Full EmbedPDF toolkit v1 | 4 (`ANNOTATION_TOOL_IDS`), 10 (UI) |
| In-place `saveAsCopy` → temp → atomic replace | 6, 7, 8 |
| Trigger on committed edits only | 7 (`committed === true`) |
| EmbedPDF History ≠ VS Code Undo | 2, 5, 10; Global Constraints |
| UI only; MCP read-only | Global Constraints; no MCP write tasks |
| Approach 1: Annotation + History SOT | 2, 3, 5 |
| Annotate vs Select Text/Region; Escape exits | 4, 5, 12 |
| Status bar + command palette only | 10, 11, 12 |
| Dirty while saving / failed; toast + Retry | 8, 9 |
| Concurrent external change: Reload vs Keep mine | 9 |
| Closing webview drops History | History plugin session; Constraints |
| Unit + browser tests; no MCP write tests | 1–3, 6–8, 12 |
| Out of scope: rotate/pan/fullscreen, Export, XFDF, ink pkg | Global Constraints |

## Placeholder / consistency self-review

- No deferred placeholders left in task steps (every step has concrete code or commands).
- `ToolMode` / `AnnotationToolId` / message names consistent across Tasks 4–11.
- Tasks 10–12 put Annotate on the status bar and in the command palette, and they do not add a slim, floating, or in-viewer annotation bar.
- Extension `pdfHistory` (jump) untouched; annotation undo uses EmbedPDF topic `"annotations"`.
- `PdfFiles.writeAtomic` optional → non-`file` hosts error (no sidecar).

## Gaps vs spec that this plan cannot fully encode

1. **Exact AnnotationLayer DOM selectors** for Playwright may need a one-time headed inspect after Task 3; Task 12 allows adjusting selectors while keeping behavior assertions fixed.
2. **Stamp `imageSrc`**: if the stock stamp tool is inert without an asset, Task 10 adds a tiny PNG under `packages/pdf/src/webview/assets/` (bytes not inlined in this plan).
3. **FreeText `/AcroForm` quirk** (feasibility): still ship FreeText per locked toolkit; external reader warnings acceptable for v1.
4. **Signed PDFs**: no signature-count refuse gate in v1 (follow-up).
5. **Host-node / non-`file` URI**: `writeAtomic` absent → error toast; no sidecar fallback (by design).

---

**Plan complete and saved to `docs/superpowers/plans/2026-10-30-pdf-annotations-direct-to-pdf.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task + review (`superpowers:subagent-driven-development`)

**2. Inline Execution** — `superpowers:executing-plans` with batch checkpoints
