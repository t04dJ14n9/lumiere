# Vim Obsidian parity — design

Date: 2026-10-29  
Status: approved (chat); implement

## Goal

Match Obsidian 1.14.4 built-in Vim (motions, operators, ex commands) in Lumière’s markdown editor, and fix go-to-line when the ex line has leading spaces (`: 123`).

## Engine

Keep `@replit/codemirror-vim` + `@replit/codemirror-vim-core`. Lumière already layers Obsidian-oriented behavior (folds, Ctrl+[ outdent, IME key routing, table motions, etc.).

Reference: `/workspace/obsidian-src/extracted/lib/codemirror/vim.js` and existing differential probe (`docs/PARITY.md` vim row; `docs/obsidian-measurements/tables/`).

## Bug: `:N` / `: N`

**Symptom:** status shows `Not an editor command ": 123"` (from vim-core `showConfirm`).

**Cause:** `ExCommandDispatcher.parseInput_` parses the line range *before* eating spaces. Input ` 123` does not match `^([\d]+)`, then after `eatSpace()` the digits become `commandName` → unknown command. Bare `123` already maps to internal ex `move`.

Obsidian’s bundled vim.js has the same missing leading-space eat before the line spec; real Vim accepts `: 123`. Product ask explicitly includes fixing spaced `:N` (strict Obsidian clone would keep the bug — we fix it).

**Fix:** In Lumière, before vim-core processes the ex string (or via a small patch to `parseInput_`), `eatSpace()` once after optional leading `:` and before line-range parse so `: 123`, `:123`, and `123` all go to line N. Prefer a focused monkeypatch/wrapper in `packages/markdown/src/plugins/vim/` over an unmaintained fork unless pnpm patch is already the repo pattern. Add unit/browser coverage.

## Parity work

1. Inventory: compare default keymap + `defaultExCommandMap` + Lumière `defineEx` / `mapCommand` vs Obsidian vim.js; list gaps that matter for note editing.
2. Close gaps that Obsidian supports and we don’t (or regress); keep Lumière maps that already match Obsidian (BH-046 folds, etc.).
3. Re-run / extend vim probes; Host GUI for `:N` and `: N`.

## Out of scope

Neovim, VSCodeVim-only commands, community Obsidian vim plugins / user vimrc, rewriting the engine.
