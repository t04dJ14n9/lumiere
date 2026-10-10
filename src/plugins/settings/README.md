# Settings commands

Quick access to the extension's settings from the Command Palette, for people
who do not want to dig through the Settings UI.

- **Markdown Workbench: Open Settings** opens the Settings UI filtered to this
  extension (`@ext:t04dj14n9.vscode-markdown-workbench`).
- **Set Note Font Size** asks for `markdownWorkbench.editor.fontSize` (8 to
  48). Run with a number argument it sets that size without asking.
- **Toggle Line Numbers** flips `markdownWorkbench.plugins.lineNumbers.enabled`.
- **Toggle Readable Line Width** flips `markdownWorkbench.editor.readableLineLength`.
- **Toggle Mermaid Diagrams** flips `markdownWorkbench.plugins.diagrams.enabled`.
- **Toggle Inline Title** flips `markdownWorkbench.plugins.inlineTitle.enabled`.
- **Toggle Vim Mode** flips `markdownWorkbench.plugins.vim.enabled` (Vim also
  decides the caret shape; see the Vim plugin).

## How it works

The commands have no state. Each run reads the setting through VS Code's
configuration (`inspect`) and writes the same key the Settings UI writes. Where
it goes: the workspace folder if the folder sets the key, else the workspace if
the workspace sets it, else the user settings, so a value you set in a
workspace is changed there and a global one stays global. A notification names
the new value and the scope. Because the change is an ordinary configuration
write, editors and views follow it through `onDidChangeConfiguration` exactly
as for an edit in the Settings UI or `settings.json`, and a change made there
is what the next command run reads.

## Files

- `manifest.ts`: the commands (window-level, so they work without an editor open).
- `commands.ts`: the toggled keys, the font size check, the settings filter.
- `host.ts`: command registration.
- `../../host/settings-access.ts`: the VS Code side (`inspect`, `update`, `openUi`).

## Services, events and settings

Injects `workbench`. Provides nothing, emits nothing. Adds no settings of its
own; every key above is contributed by the plugin that owns it.

## Limits and differences from Obsidian

Obsidian has no command-palette entries for its settings; this is a VS Code
convenience. "Line numbers" flips the plugin; the style (`on`, `relative`,
`interval`) stays VS Code's `editor.lineNumbers`.
