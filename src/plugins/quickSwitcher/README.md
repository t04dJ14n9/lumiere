# Quick switcher

**Markdown Workbench: Quick Switcher** finds a note by name, alias or path and
opens it, or creates it when no note has that name. This is Obsidian's
**Quick switcher** core plugin.

## How it works

The command opens a quick pick over the active note's vault (or the first
workspace folder's). Each keystroke ranks notes, their aliases and links
whose note does not exist yet with Obsidian's fuzzy scoring (`src/shared/
fuzzy.ts`); a match on a name ranks above a match on a path. An empty query
lists recently modified notes. Choosing a missing note, or pressing Enter on
a name no note has, creates it in the new-note folder.

## Files

- `host.ts`: the command, opening and creating.
- `ranking.ts`: the ranked items for a query.
- `manifest.ts`: the command contribution.

## Services, events and settings

- Injects `workbench` (views, navigation) and `vaults`.
- Settings: `markdownWorkbench.plugins.quickSwitcher.enabled`,
  `markdownWorkbench.files.newNoteFolder`.

## Limits and differences from Obsidian

- The command has no key binding: Cmd/Ctrl+O is VS Code's **Open File**. Bind
  one in Keyboard Shortcuts if you want Obsidian's.
- An empty query lists recently modified notes rather than recently opened
  ones. Attachments are not listed. Excluded files are left out.
