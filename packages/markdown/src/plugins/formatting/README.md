# Formatting

Formats Markdown selections, words and lines using Obsidian-style editor
commands: emphasis, code, comments, headings, lists, quotes, links and line moves.

## How it works

Inline toggling uses the shared dialect to locate enclosing syntax at the caret;
otherwise it wraps the word or selection, or removes selected delimiters. As
in Obsidian 1.14, a selection anywhere inside a span unwraps the whole span,
and one over or around spans merges them into one (`spans.ts`).

Highlights take Obsidian 1.14's colours, an emoji right after `==`
(`==🔵text==`): **Toggle Red Highlight** and the five other colours wrap the
word or selection in that colour; on a highlight they recolour it, or remove
it in its own colour; on part of one they split it, the part in the new
colour and the rest in its own, spaces left outside; highlights a selection
spans merge (`highlight-colour.ts`). Typing `==` that opens a highlight offers
Default and the six colours; taking one wraps an immediately following word,
reuses its closing `==` if present, or opens an empty pair, with the caret
inside after the colour (`highlight-suggest.ts`); Tab takes nothing, as in
Obsidian. Line commands edit each selected line, excluding a final column-zero line. Registered
commands target the active projected editor (including table cells), and owned
keymaps provide bold, italic, link and comment shortcuts. As in Obsidian,
Insert Link leaves the caret in the empty URL after a selected label (else in
the empty label), and Toggle Comment wraps the selection or the word at the
caret in `%%…%%` (no spaces, as in 1.14) with it selected, or inserts an empty comment
(`comment.ts`). Pasting a URL (any `scheme:` text without spaces) over
selected text on one line links the text and selects the link
(`paste-link.ts`). Those keymaps stop the
keystroke there: VS Code forwards webview keystrokes that reach the window to
its keybinding service, which would otherwise run the contributed binding a
second time (Ctrl+B bolding then unbolding) or Cursor's own Ctrl+I. The
contributed bindings still apply when focus is outside the editor text.
Read-only views reject edits.

## Files

- `manifest.ts`: command and keybinding contributions.
- `api.ts`: injected formatting service contract.
- `webview.ts`: service, command catalogue and keymap registrations.
- `format-keys.ts`: capture-phase Ctrl/Cmd+B/I so Vim cannot page-back / jumplist-steal bold and italic; Vim host consume yields while formatting is on (BH-024).
- `format-keys.test.ts`: Mod+B/I mapping and native-field skip.
- `inline.ts`: inline clearing, caret/word wrapping and selection toggling.
- `spans.ts`: the formatted spans around a selection.
- `highlight-colour.ts`: the coloured highlight commands.
- `highlight-suggest.ts`: the colour list after `==`.
- `lines.ts`: heading/list/quote edits and link insertion.
- `formatting.test.ts`: pure editor-state command units.

## Services, events and settings

Injects `editor` and `commands`; provides `formatting` with wrap and clear
operations. Queries the `editor/activeView` bail event for palette commands.
`lumiere.markdown.plugins.formatting.enabled` defaults to true. Bold, italics
Insert Link and Toggle Comment use Mod+B, Mod+I, Mod+K and Mod+/.

## Limits and differences from Obsidian

After a highlight colour command the selection stays on the same text;
Obsidian 1.14 sometimes leaves it elsewhere, and with a selection running past
a highlight's end it can garble the markers (`==🔴two t==hree`), which Workshop
does not copy. Coloured highlight toggles appear on the editor context menu
(and in the command palette), matching Obsidian's colour set.

VS Code owns saves and undo. Formatting changes source directly, including table
cell projections. No live-reference keybinding or visual-parity observation is
claimed; remaining shortcuts await the owner's verification.
