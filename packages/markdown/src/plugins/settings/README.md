# Settings commands

Quick access to the extension's settings from the Command Palette, for people
who do not want to dig through the Settings UI.

- **Lumière: Open Settings** opens the Settings UI filtered to this
  extension (`@ext:t04dj14n9.vscode-markdown-workshop`).
- **Change Setting…** lists every setting this extension contributes, read
  from the installed package.json (so it cannot drift), grouped by plugin with
  the current value and description, filtered as you type. Picking one edits
  it by its type: a boolean flips, an enum opens a pick list of its values, a
  number or integer opens an input box checked against the schema's minimum,
  maximum and integer type, a string opens an input box, and an array or
  object opens the Settings UI on that key (`@id:lumiere.markdown.<key>`).
  Run with a key as its argument it skips the list.
- **Set Note Font Size** asks for `lumiere.markdown.editor.fontSize` (8 to
  48). Run with a number argument it sets that size without asking.
- **Toggle Line Numbers** flips `lumiere.markdown.plugins.lineNumbers.enabled`.
- **Toggle Readable Line Width** flips `lumiere.markdown.editor.readableLineLength`.
- **Toggle Mermaid Diagrams** flips `lumiere.markdown.plugins.diagrams.enabled`.
- **Toggle Inline Title** flips `lumiere.markdown.plugins.inlineTitle.enabled`.
- **Toggle Vim Mode** flips `lumiere.markdown.plugins.vim.enabled` (Vim also
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

## What the commands trust

Nothing they are given. The list comes from the installed package.json, but a
write passes `checkWrite` (`src/shared/setting-schema.ts`) twice, once in the
command and once where the setting is written (`src/host/settings-access.ts`):
the key must be one of this extension's own contributed `lumiere.markdown.*`
settings (a key from another extension, a VS Code key or an unknown key is
refused, whoever passes it, including a key argument from a keybinding or
another extension), and the value must pass that setting's schema: type,
`enum`, `minimum`, `maximum` and integer-ness. Lists, objects and settings the
schema does not describe are never written by a command; they open in the
Settings UI. Current values read from settings files are shown but never
trusted (a hand-edited text value for a number prompts from the schema
default; a non-boolean toggle starts from the schema's default). If
package.json cannot be read, the commands report that and write nothing. The
toggles take their default from the schema, and a unit test checks that every
dedicated command's key exists in package.json with the right type.

## Files

- `manifest.ts`: the commands (window-level, so they work without an editor open).
- `change.ts`: the settings list, grouping and display (pure).
- `commands.ts`: the toggled keys and the settings filter.
- `edit.ts`: editing by type and `writeSetting`, the single write path.
- `../../shared/setting-schema.ts`: schema kinds, value checks and the write gate.
- `host.ts`: command registration.
- `../../host/settings-access.ts`: the VS Code side (`inspect`, `update`, `openUi`).

## Services, events and settings

Injects the host services `hostCommands`, `dialogs`, `activeEditor` and `settings`. Provides nothing, emits nothing. Adds no settings of its
own; every key above is contributed by the plugin that owns it.

## Limits and differences from Obsidian

Obsidian has no command-palette entries for its settings; this is a VS Code
convenience. "Line numbers" flips the plugin; the style (`on`, `relative`,
`interval`) stays VS Code's `editor.lineNumbers`.
