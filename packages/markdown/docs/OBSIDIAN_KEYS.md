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
| Home, Cmd+Left | `- [ ] abc\|`, `- **bold**\|`, `- ==🔵hi==\|` | text start after markup first (past LP-hidden `**`/`[[`/`[`/`<kbd>`/`==🔵`), then line start |
| Shift+Home | `- abc\|` | `- ‹abc›` |
| End, Cmd+Right (1.14) | `\|a **bold**`, `\|a [[Home]]`, `\|see [t](u)`, `\|a <kbd>x</kbd>` | past unified LP-hidden closers (`**`, `]]`, `](…)`, autolink `>`, `</kbd>`, …) to the line end |

## Pairing and formatting (autoPair, formatting, tasks)

| Keys | Before | Obsidian and Workshop |
| --- | --- | --- |
| `(` `[` `{` `"` `` ` `` `*` `_` | `a \|` | pair, with the caret inside |
| `=` `~` `$` `%` | `a ‹w› b` | `a =‹w›= b` (wrap); alone they type as they are |
| Third backtick | `- ``\|` | `- ```\|`, and the next line closes the fence, lined up with the item's text |
| Cmd+B, Cmd+I | `hello wo\|rld` | `hello **wo\|rld**` |
| Cmd+K | `hello ‹world›` | `hello [world](\|)`; with no selection `[\|]()` |
| Cmd+/ (1.14) | `hello wo\|rld` | `hello %%‹world›%%`; on an empty line `%%\|%%` |
| Cmd+L | `a\|` | `- [ ] a\|`, then `- [x] a\|`, then `- [ ] a\|` |
| Cmd+L | `> a\|` | `> - [ ] a\|` |

## Editor commands (formatting, math, callouts, tables, tasks, footnotes)

Each command was run on the same note and selection in Obsidian and in
Workshop (an empty line, a caret in a word, a selected word, two selected
lines, a list item, a heading); 150 of 150 cases match. Insert Footnote keeps
the caret after the reference and edits the definition in a popover (1.14);
an EOF caret with trailing blanks still gets a blank line before the
definition.

| Command | Before | After |
| --- | --- | --- |
| Bold (and italic, strikethrough, highlight, code, inline math) | `‹one\ntwo›` | `**‹one**\n**two›**`: each line on its own; again unwraps |
| Inline math | `te\|xt` | `$te\|xt$`, the word, as bold does |
| Bullet list, numbered list, quote, heading | `\|` | `- \|`: the caret after the marker |
| Numbered list | `- it\|em` | `1. it\|em`; again `it\|em`; a task's box goes too |
| Cycle list/checklist | `te\|xt` | `- te\|xt`, `- [ ] te\|xt`, `- [x] te\|xt`, `- te\|xt` |
| Insert callout | `te\|xt` | `> [!‹NOTE›]\n> text`; on an empty line `> [!‹NOTE›] Title\n> Contents`; a blank line from text around |
| Insert math block | `te\|xt` | `$$\nte\|xt\n$$`: around the selected lines |
| Insert table | `te\|xt` | `text\n\n\|\|     \|     \|\n\| --- \| --- \|\n\|     \|     \|\n`: after the line |
| Insert horizontal rule | `te\|xt` | `te\n\n---\n\|xt` |
| Insert wikilink, Insert embed | `‹text›` | `[[text\|]]`: the caret after the text |
| Insert footnote | `te\|xt` | `te[^1]\|xt\n\n[^1]: \n`: caret after the reference; popover edits the definition; before a selection, which stays |
| Open link under cursor in new tab | | a tab VS Code keeps, as Cmd-click |
| Insert code block | `te\|xt` | ` ```\nte\|xt\n``` `: around the selected lines |
| Insert tag | `a ‹word› b` | `a #\|word b` |
| Clear formatting | `a **‹b›** c` | `a ‹b› c`; a caret alone changes nothing; links keep their syntax |
| Delete paragraph | `one\ntw\|o\nthree` | `one\nth\|ree` (unbound: Cmd+D is VS Code's) |
| Add cursor above, below | `one\nth\|ree` | carets on both lines, the new one main (Cmd+Alt+Up and Down, as in VS Code) |

More than one caret works as in Obsidian: Alt-click adds one, and typing
goes to every caret. Cmd+D adds the next match of the selection, as in VS
Code.

## Deliberate differences

- Cmd+D: Obsidian deletes the line; Workshop selects the next match, as VS
  Code does (Delete Paragraph is in the Command Palette).
- Alt+Up and Alt+Down move the line, as in VS Code; Obsidian moves the caret.
- Cmd+Enter inserts a line below, as in VS Code; Obsidian follows a link.
- Cmd+L in Cursor opens Cursor's chat (with a selection, Add to Chat).
