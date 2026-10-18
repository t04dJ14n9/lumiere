# Word count

Shows the active note's words and characters in the status bar, or the
selection's when text is selected. This is Obsidian's **Word count** core
plugin.

## How it works

The count follows the active tab, in this editor or the text editor, and
updates after edits and selection changes. It counts as Obsidian does
(measured on 76 texts): a word is a run of letters, digits, hyphens and
apostrophes, where `,` and `.` join digits only (`1,000.50` is one word,
`e.g.` two), so a lone `-` bullet is a word too. Han and kana characters
count one each, while Korean runs whole words; combining marks end a word,
except in Tamil. Characters are the text's length, line breaks included.
A note's properties are not counted; a selection's are.

## Files

- `host.ts`: the plugin and status bar item.
- `count.ts`: counting and formatting.
- `manifest.ts`: the plugin's switch.

## Services, events and settings

- Injects the host services `hostDocuments`, `views` and `activeEditor` and, optionally, `editors`.
- Listens to `editor/selectionChanged`.
- Setting: `markdownWorkshop.plugins.wordCount.enabled`.

## Limits and differences from Obsidian

- None in the counting rules measured. Obsidian's letter table predates a
  few hundred newer Unicode letters, which count here and not there.
