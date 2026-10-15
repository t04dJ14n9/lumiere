# Formatting

Formats Markdown selections, words and lines using Obsidian-style editor
commands: emphasis, code, comments, headings, lists, quotes, links and line moves.

## How it works

Inline toggling uses the shared dialect to locate enclosing syntax at the caret;
otherwise it wraps the word or selection, or removes selected delimiters. Line
commands edit each selected line, excluding a final column-zero line. Registered
commands target the active projected editor (including table cells), and owned
keymaps provide bold, italic and link shortcuts. Those keymaps stop the
keystroke there: VS Code forwards webview keystrokes that reach the window to
its keybinding service, which would otherwise run the contributed binding a
second time (Ctrl+B bolding then unbolding) or Cursor's own Ctrl+I. The
contributed bindings still apply when focus is outside the editor text.
Read-only views reject edits.

## Files

- `manifest.ts`: command and keybinding contributions.
- `api.ts`: injected formatting service contract.
- `webview.ts`: service, command catalogue and keymap registrations.
- `inline.ts`: inline clearing, caret/word wrapping and selection toggling.
- `lines.ts`: heading/list/quote edits and link insertion.
- `formatting.test.ts`: pure editor-state command units.

## Services, events and settings

Injects `editor` and `commands`; provides `formatting` with wrap and clear
operations. Queries the `editor/activeView` bail event for palette commands.
`markdownWorkshop.plugins.formatting.enabled` defaults to true. Bold, italics
and Insert Link use Mod+B, Mod+I and Mod+K. Verify bindings remain unbound.

## Limits and differences from Obsidian

VS Code owns saves and undo. Formatting changes source directly, including table
cell projections. No live-reference keybinding or visual-parity observation is
claimed; remaining shortcuts await the owner's verification.
