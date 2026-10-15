# Word count

Shows the active note's words and characters in the status bar, or the
selection's when text is selected. This is Obsidian's **Word count** core
plugin.

## How it works

The count follows the active tab, in this editor or the text editor, and
updates after edits and selection changes. Han, kana and Hangul characters
count as one word each; other words are runs of letters and digits.
Properties and Markdown punctuation are not counted; characters exclude line
breaks.

## Files

- `host.ts`: the plugin and status bar item.
- `count.ts`: counting and formatting.
- `manifest.ts`: the plugin's switch.

## Services, events and settings

- Injects `workbench` (views) and, optionally, `editors`.
- Listens to `editor/selectionChanged`.
- Setting: `markdownWorkshop.plugins.wordCount.enabled`.

## Limits and differences from Obsidian

- Counting rules are this plugin's own reading of Obsidian's; compare a few
  notes in a disposable vault before relying on exact numbers.
