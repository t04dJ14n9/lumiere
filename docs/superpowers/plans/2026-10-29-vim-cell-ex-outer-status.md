# Vim cell ex → outer status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount table-cell Vim `:` / `/` / `?` dialogs on the outer note status bar while keeping cell Vim state and `status: false` chrome.

**Architecture:** Small helper assigns the outer note’s `cm.state.statusbar` DOM onto the nested cell adapter; a ViewPlugin in `vimExtensions(ctx, false)` installs it. Library `updateStatus` then hosts dialogs on the shared bar instead of `showVimPanel`.

**Tech Stack:** TypeScript, `@replit/codemirror-vim`, CodeMirror 6 `ViewPlugin`, Node `node:test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-29-vim-cell-ex-outer-status-design.md`
- Cells stay `vim({ status: false })`
- Do not change fullwidth `：` / IME in this PR
- Unit tests for the proxy; Host GUI acceptance is parent’s
- Do not merge the PR

---

### Task 1: Docs (spec already drafted) + commit

**Files:**
- Create: `docs/superpowers/specs/2026-10-29-vim-cell-ex-outer-status-design.md`
- Create: `docs/superpowers/plans/2026-10-29-vim-cell-ex-outer-status.md`

- [ ] **Step 1: Commit docs**

```bash
git add docs/superpowers/specs/2026-10-29-vim-cell-ex-outer-status-design.md \
  docs/superpowers/plans/2026-10-29-vim-cell-ex-outer-status.md
git commit -m "$(cat <<'MSG'
docs(markdown): spec vim cell ex dialog on outer status bar

Host GUI confirmed nested cell `:` panel (H1). Spec shares the outer
note statusbar with cell adapters; IME fullwidth out of scope.
MSG
)"
```

---

### Task 2: Failing unit tests for statusbar proxy

**Files:**
- Create: `packages/markdown/src/plugins/vim/cell-ex-status.ts` (export stub that throws / no-op until Task 3 — prefer missing export so test fails to import, then minimal stub)
- Create: `packages/markdown/src/plugins/vim/cell-ex-status.test.ts`

**Interfaces:**
- Produces: `proxyCellExDialogToOuterStatus(cell, outer): () => void`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { proxyCellExDialogToOuterStatus } from "./cell-ex-status";

type Adapter = { state: { statusbar?: HTMLElement | null } };

test("assigns outer statusbar onto the cell adapter", () => {
  const host = { tag: "host" } as unknown as HTMLElement;
  const cell: Adapter = { state: {} };
  const outer: Adapter = { state: { statusbar: host } };
  const restore = proxyCellExDialogToOuterStatus(cell, outer);
  assert.equal(cell.state.statusbar, host);
  restore();
  assert.equal(cell.state.statusbar, undefined);
});

test("no-ops when outer has no statusbar", () => {
  const cell: Adapter = { state: {} };
  const restore = proxyCellExDialogToOuterStatus(cell, { state: {} });
  assert.equal(cell.state.statusbar, undefined);
  restore();
});

test("restore leaves a newer statusbar assignment alone", () => {
  const host = { tag: "host" } as unknown as HTMLElement;
  const other = { tag: "other" } as unknown as HTMLElement;
  const cell: Adapter = { state: {} };
  const restore = proxyCellExDialogToOuterStatus(cell, {
    state: { statusbar: host },
  });
  cell.state.statusbar = other;
  restore();
  assert.equal(cell.state.statusbar, other);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/markdown && pnpm exec tsx --test src/plugins/vim/cell-ex-status.test.ts
```

Expected: FAIL (module missing or function not implemented).

- [ ] **Step 3: Minimal implementation in `cell-ex-status.ts`**

```ts
type StatusHost = { state: { statusbar?: HTMLElement | null } };

/** Point a nested cell Vim adapter’s dialog host at the outer note status bar. */
export function proxyCellExDialogToOuterStatus(
  cell: StatusHost,
  outer: StatusHost | null | undefined,
): () => void {
  const host = outer?.state.statusbar;
  if (!host) {
    return () => {};
  }
  const previous = cell.state.statusbar;
  cell.state.statusbar = host;
  return () => {
    if (cell.state.statusbar === host) {
      cell.state.statusbar = previous;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/markdown && pnpm exec tsx --test src/plugins/vim/cell-ex-status.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/markdown/src/plugins/vim/cell-ex-status.ts \
  packages/markdown/src/plugins/vim/cell-ex-status.test.ts
git commit -m "test(markdown): lock cell vim ex dialog statusbar proxy"
```

---

### Task 3: Wire proxy into `vimExtensions(ctx, false)`

**Files:**
- Modify: `packages/markdown/src/plugins/vim/webview.ts`
- Modify: `packages/markdown/src/plugins/vim/cell-ex-status.test.ts` (optional: ViewPlugin smoke if cheap; otherwise keep helper-only)

**Interfaces:**
- Consumes: `proxyCellExDialogToOuterStatus`, `getCM`, `ctx.editor.view`
- Produces: nested vim extensions install the share plugin

- [ ] **Step 1: Add ViewPlugin helper export or local function**

In `cell-ex-status.ts` add:

```ts
import { ViewPlugin, type EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { getCM } from "@replit/codemirror-vim";

export function shareOuterStatusForCellDialogs(outer: EditorView): Extension {
  return ViewPlugin.fromClass(
    class {
      private restore: () => void = () => {};
      constructor(view: EditorView) {
        this.restore = proxyCellExDialogToOuterStatus(
          getCM(view) ?? { state: {} },
          getCM(outer),
        );
      }
      destroy() {
        this.restore();
      }
    },
  );
}
```

- [ ] **Step 2: Use it from `vimExtensions`**

```ts
function vimExtensions(ctx: Context, status: boolean) {
  return [
    vim({ status }),
    ...(status ? [] : [shareOuterStatusForCellDialogs(ctx.editor.view)]),
    vimLineKeyboard,
    // ...rest unchanged
  ];
}
```

- [ ] **Step 3: Re-run unit tests + format**

```bash
cd packages/markdown && pnpm exec tsx --test src/plugins/vim/cell-ex-status.test.ts src/plugins/vim/ex-address-space.test.ts
cd /tmp/lumiere-wt-wide-parity && pnpm exec prettier --write \
  packages/markdown/src/plugins/vim/cell-ex-status.ts \
  packages/markdown/src/plugins/vim/cell-ex-status.test.ts \
  packages/markdown/src/plugins/vim/webview.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/markdown/src/plugins/vim/cell-ex-status.ts \
  packages/markdown/src/plugins/vim/webview.ts
git commit -m "fix(markdown): proxy cell vim ex/search dialog to outer status bar"
```

---

### Task 4: Full `packages/markdown` test + lint gate

- [ ] **Step 1: Run package tests**

```bash
cd /tmp/lumiere-wt-wide-parity/packages/markdown && pnpm test
```

- [ ] **Step 2: Fix any Prettier/eslint failures from changed files**

```bash
cd /tmp/lumiere-wt-wide-parity && pnpm exec eslint packages/markdown/src/plugins/vim/cell-ex-status.ts packages/markdown/src/plugins/vim/webview.ts
```

- [ ] **Step 3: Commit any lint-only fixes if needed**

---

### Task 5: Push branch and open PR (do not merge)

- [ ] **Step 1: Push**

```bash
git push -u origin fix/vim-cell-ex-outer-status
```

- [ ] **Step 2: Open PR** with Host GUI checklist:

- Cell `:` shows on outer note status bar (not nested in cell)
- `:w` + Enter saves; cell text unchanged
- No nested `.cm-vim-panel` inside the cell
- Prose `:` still uses outer bar

Base: `main`. Do **not** merge.
