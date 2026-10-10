---
title: A property parity note
status: draft
text: "Text containing a: colon # and a hash"
list:
  - First item
  - Second item
number: 4.5
checkbox: false
date: 2026-10-08
datetime: 2026-10-08T14:30
tags:
  - fixture
  - properties/parity
aliases:
  - Properties parity
cssclasses:
  - wide
related: "[[Target]]"
links:
  - "[[Target]]"
  - "[[notes/Project plan]]"
empty:
---

# Properties parity

Use this note with `Properties.md` to compare the sheet with the measured
Obsidian 1.14.4 behaviour in `docs/properties-diff.md`.

- Edit text, number, checkbox, date, date and time, tags, aliases and list values
  directly in the sheet. The `related` field opens Target; its pencil edits the
  wikilink. The `links` list also contains wikilinks as pill text.
- Change `status` to Number in the type menu: a warning appears, and the YAML
  stays `status: draft`. The same property name in another note uses Number.
  Automatic clears that preference and restores inference.
- Press Mod+; to add a property. Type `st` to suggest `status` and `list`;
  the existing name is rejected. Try a new name, then fill its value.
- Use Enter, Tab, arrows, Delete and Escape on keys, values and rows. Use
  Backspace twice in an empty pill input to focus and then remove its last item.
- Collapse the sheet: it stays collapsed for this note only (per-note, as in Obsidian).
