# Obsidian editing keys, measured

Measured on 2026-10-17 in real Obsidian (default settings) in a throwaway
vault and profile, never the owner's, driven over the Chrome DevTools
protocol: each case set a note and a selection, pressed or typed keys, and
read the note and the selection back. The same cases ran in Workshop's editor
(the browser harness, Obsidian preset); 172 of 182 now give the same note and
selection. The probe was throwaway and is not committed.

Notation: `|` is the caret, `‹…›` a selection.

## Lists and quotes (smartLists, editor)

| Keys | Before | Obsidian and Workshop |
| --- | --- | --- |
| Enter | `- a\|` | `- a`, `- \|` (also `*`, `1.`, `2)`, tasks start `[ ] `) |
| Enter | `- a`, `- \|` | `- a`, `\|` (an empty item leaves the list) |
| Enter | `- \|a` | `- `, `- \|a` (the space before the caret stays) |
| Enter | `> a`, `> \|` | `> a`, an empty line, then the caret on a new line (an empty quoted line steps out a level) |
| Enter | `> > a`, `> > \|` | `> > a`, `> `, `> \|` |
| Enter | `- a`, `  b\|` | `- a`, `  b`, `- \|` (a continuation line starts an item) |
| Shift+Enter | `- [ ] a\|` | `- [ ] a`, `      \|` (lined up with the text) |
| Shift+Enter | `> a\|` | `> a`, `> \|` |
| Backspace | `- \|b` | `-\|b` (one character, never the whole marker) |
| Tab | `ab\|c` | `\tab\|c` (the line, wherever the caret is) |
| Tab | `1. a`, `2. b\|`, `3. c` | `1. a`, `\t1. b\|`, `2. c` (lists renumber) |
| typing | `1. a`, `1. b\|`, `1. c` | `1. a`, `2. bz\|`, `3. c`: an edit inside a list renumbers it (opening a note does not) |
| Shift+Tab | `1. a`, `\t1. b\|`, `2. c` | `1. a`, `2. b\|`, `3. c` |
| Home, Cmd+Left | `- [ ] abc\|` | `- [ ] \|abc`, then `\|- [ ] abc` |
| Shift+Home | `- abc\|` | `- ‹abc›` |

## Pairing and formatting (autoPair, formatting, tasks)

| Keys | Before | Obsidian and Workshop |
| --- | --- | --- |
| `(` `[` `{` `"` `` ` `` `*` `_` | `a \|` | pair, with the caret inside |
| `=` `~` `$` `%` | `a ‹w› b` | `a =‹w›= b` (wrap); alone they type as they are |
| Third backtick | `- ``\|` | `- ```\|`, and the next line closes the fence, lined up with the item's text |
| Cmd+B, Cmd+I | `hello wo\|rld` | `hello **wo\|rld**` |
| Cmd+K | `hello ‹world›` | `hello [world](\|)`; with no selection `[\|]()` |
| Cmd+/ | `hello wo\|rld` | `hello %% ‹world› %%`; on an empty line `%% \| %%` |
| Cmd+L | `a\|` | `- [ ] a\|`, then `- [x] a\|`, then `- [ ] a\|` |
| Cmd+L | `> a\|` | `> - [ ] a\|` |

## Deliberate differences

- Cmd+D: Obsidian deletes the line; Workshop leaves it to VS Code, where it
  selects the next match.
- Alt+Up and Alt+Down move the line, as in VS Code; Obsidian moves the caret.
- Cmd+Enter inserts a line below, as in VS Code; Obsidian follows a link.
- Cmd+L in Cursor opens Cursor's chat (with a selection, Add to Chat).
- Removing a comment with Cmd+/ also removes the spaces just inside its `%%`,
  which Obsidian leaves behind (`hello  world `).
