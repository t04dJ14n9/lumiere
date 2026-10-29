# Vim table-cell ex / search dialog → outer note status bar

**Date:** 2026-10-29  
**Status:** Approved for implementation  
**Branch:** `fix/vim-cell-ex-outer-status`  
**Related:** Host GUI H1 (`vim-table-colon-hostgui.md`); investigation `vim-table-colon-investigation.md`; engine `#444` ex address space

## Goal

When a **Live Preview table cell** Vim adapter opens an ex or search dialog (`:`, `/`, `?`), mount that dialog on the **outer note** Vim status bar (the same host as `vimExtensions(ctx, true)`), while keystrokes and Vim state stay on the **cell** adapter until the dialog closes. Cell chrome stays `status: false` (no permanent `--NORMAL--` inside every cell). Prose `: ` behavior is unchanged. Fullwidth `：` / IME is **out of scope**.

## Confirmed bug (Host GUI)

In a focused cell with Vim on, ASCII `:` / `:w` opens a tiny `.cm-vim-panel` **inside the cell**. The outer note bar stays `--NORMAL--`. Cell text is not corrupted. Prose `:` correctly replaces the outer bar with a `:` prompt.

Root cause: cells call `vimExtensions(ctx, false)` → `@replit/codemirror-vim` `vim({ status: false })`. With no `cm.state.statusbar`, the library’s `dialog` handler dispatches `showVimPanel`, mounting a temporary nested panel under the cell editor.

## Approach (chosen)

**Share the outer statusbar DOM with the cell adapter** when nested Vim extensions attach:

1. Keep `vim({ status: false })` for cells (no permanent cell status panel).
2. After the cell `CodeMirror` adapter exists, set `cellCm.state.statusbar = outerCm.state.statusbar` (the outer note’s `.cm-vim-panel` host).
3. When the cell opens a dialog, the existing library path sees `statusbar` and calls `updateStatus()`, which appends `cm.state.dialog` to that shared host — i.e. the outer bar — and does **not** open `showVimPanel`.
4. Ex / search callbacks and `defineEx` (`:w` → save, etc.) still run against the **cell** adapter. Mode sync (`environment.vim.sync`) is unchanged.
5. On cell destroy / vim compartment off, clear the shared assignment.

Rejected for this PR:

- Enabling `status: true` per cell (permanent nested chrome).
- Rewriting `openDialog` to run entirely on the outer adapter (would move ex state off the cell).
- Fullwidth `：` mapping and cell `beforeinput` guard (H2; not Host-GUI-proven).

## Components

| Piece | Role |
| --- | --- |
| `packages/markdown/src/plugins/vim/cell-ex-status.ts` | Pure helper: assign / restore `cell.state.statusbar` from outer |
| `vimExtensions(ctx, false)` | Install a small `ViewPlugin` that calls the helper with `ctx.editor.view` as outer |
| Unit test `cell-ex-status.test.ts` | Lock assign / restore / no-op when outer has no statusbar |
| Host GUI checklist (PR body) | Cell `:` on outer bar; `:w` saves; no nested bar; prose unchanged |

## Data flow

```
cell normal `:` → vim-core ex → cell.openDialog
  → showDialog(cell) sets cell.state.dialog, signals "dialog"
  → cell vimPlugin: statusbar present → updateStatus()
  → dialog DOM appended to outer .cm-vim-panel
  → input focused; keys update cell ex state
  → Enter / Esc → callback / close on cell → hideDialog → outer bar restores mode label
```

## Testing

- **Unit (required):** helper assigns outer host; restore clears; missing outer statusbar is a no-op.
- **Browser:** not required for this PR unless already green suites regress; Host GUI is the acceptance gate for nesting.
- **Host GUI (parent, after PR):** focused cell `:`, `:w`+Enter, Esc; prose `:`; wide scrolled table.

## Out of scope

- Fullwidth `：` / Chinese IME punctuation → `:`
- Cell-level `beforeinput` normal-mode guard
- Grid-selection `enterSelectedCell` changes for `:` (H3 not matched)
- Changing `defineEx` / save pipeline
- Merging this PR (parent Host GUI then merge)
