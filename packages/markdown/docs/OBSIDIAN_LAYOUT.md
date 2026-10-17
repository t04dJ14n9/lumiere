# Obsidian Live Preview layout, measured

Measured on 2026-10-17 in real Obsidian (default theme and settings, 16px
text) in a throwaway vault and profile, never the owner's, by reading the
computed styles and text positions of the same note in Obsidian and in
Workshop's editor (the browser harness). Sizes are matched, not Obsidian's
CSS: Workshop's stylesheets are its own. Positions are relative to a
paragraph's text.

| What | Obsidian | Workshop |
| --- | --- | --- |
| Space above a heading | one body-text size (16px; 20px at 20px), none below | same (`markdown.css`) |
| List item line | 26px: 0.075em above and below | same |
| List level | 2.25em (36px) | same (`--list-indent`) |
| Bullet text | 23px in (1.25em + 3px), the bullet 12px in | same |
| Numbered text | 30px in (1.5em + 6px) for any number | same |
| Task text | 27px in (1.75em − 1px); a 16px box, 4px corners | same |
| Quote text | 14px in per level, a 2px bar | same |
| Code | 0.875em (14px), lines 21px | same (`--code-size`) |
| Code language label | 12px, in the corner | same |
| Display math | 16px above and below the formula | same |
| Callout | 12/12/12/24px padding, title 1.3 lines, a line's space around the body | same |
| Table cell | 4px by 8px padding, 1.3 lines | same |
| Block widget | no space of its own around it | same |

Differences that remain:

- Tables: Obsidian hangs the table's handle strip in the margin, so the table
  lines up with the text; Workshop's table sits 16px in, because there its
  row grips would fall under the line-number gutter.
- Inline math can make its line 1–2px taller than Obsidian's.
- CodeMirror pads every line 2px at the start; all text sits 2px right of
  Obsidian's.
- An empty line after a footnote definition is a normal line (Obsidian sets
  it in the footnote's smaller size).
- A paragraph line right after a quote is part of the quote (CommonMark's lazy
  continuation, as in Obsidian's reading view); Obsidian's Live Preview shows
  it as a paragraph.
