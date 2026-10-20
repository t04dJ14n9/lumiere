# Quick switcher

**Lumière: Quick Switcher** finds a note by name, alias or path and
opens it, or creates it when no note has that name. This is Obsidian's
**Quick switcher** core plugin.

## How it works

The command opens a quick pick over the active note's vault (or the first
workspace folder's). Each keystroke ranks notes, attachments (images, audio,
video, PDFs, canvases and bases, as Obsidian's default "Show attachments"),
notes' aliases and links whose note does not exist yet with Obsidian 1.14's
fuzzy scoring (`src/shared/fuzzy.ts`): a file matches on its name, or on its
path a point lower, and an excluded file ranks 10 points lower. An empty query
lists recently opened notes (mtime fallback). Choosing a missing note, or pressing Enter on
a name no note has, creates it in the new-note folder.

## Files

- `host.ts`: the command, opening and creating.
- `ranking.ts`: the ranked items for a query.
- `recent.ts`: workspace-scoped recently opened note URIs.
- `manifest.ts`: the command contribution.

## Services, events and settings

- Injects the host services `hostCommands`, `dialogs`, `activeEditor`, `settings` and `navigation`, plus `vaults`.
- Settings: `lumiere.markdown.plugins.quickSwitcher.enabled`,
  `lumiere.markdown.files.newNoteFolder`.

## Limits and differences from Obsidian

- The command has no key binding: Cmd/Ctrl+O is VS Code's **Open File**. Bind
  one in Keyboard Shortcuts if you want Obsidian's.
- An empty query lists recently opened notes (workspace storage), then falls
  back to recently modified for notes never opened here. Bookmarks are not listed.
