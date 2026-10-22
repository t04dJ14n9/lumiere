# BH-036 Host GUI — Vim on: Ctrl+K Insert Link

## Bug
With Vim on and formatting enabled, Ctrl+K was swallowed by
`consumeVimHostShortcut` (same host-noop pattern as BH-024 Ctrl+B/I). Insert
Link never ran: visual selection cleared, character count unchanged (940→940).

## Fix
Gate the Ctrl+K host consume on `!lumiere.markdown.plugin.formatting` (and keep
`!isCursorHost`), so formatting's Insert Link binding wins while Vim is on.

## Host GUI
- Integ DISPLAY :7, Live Preview only, Reload-only (pid 4044655).
- Tip build hot-patched `0.1.5-pr-BH036` keybindings into integ extension.
- **Before (pre-fix):** Vim ON, visual word selection; Ctrl+K → noop (940 chars).
- **After:** Vim ON, `viw` on a word → `-- VISUAL --` / 1 word 4 characters;
  Ctrl+K → `-- NORMAL --` / 146 words **944** characters (Insert Link +4).
- Shots: `00-pre-fix-ctrlk-noop.png`, `00-before-sel-visual.png`,
  `01-after-ctrlk-insert-link.png`, `01-after-ctrlk-top.png`.
