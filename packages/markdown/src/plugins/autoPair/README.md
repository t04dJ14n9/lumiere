# Auto pair

Automatically closes brackets, quotes and Markdown markers, corresponding to
Obsidian's Auto pair brackets and Auto pair Markdown syntax settings.

## How it works

CodeMirror's close-brackets input handler and empty-pair Backspace keymap use
language data from this plugin. With Markdown pairing on, `markdown-input.ts`
adds what bracket closing cannot express, as in Obsidian: `=`, `~`, `$` and
`%` wrap a selection but type alone without one, and the third backtick
closes a code fence on the next line, keeping the line's quotes and list
indentation. Independent configuration flags select bracket
and Markdown families. A private compartment updates that data without replacing
the editor or unrelated plugin state; disposal removes the registrations.

## Files

- `manifest.ts`: enablement and bracket/Markdown configuration schema.
- `webview.ts`: pair selection, input/key registration and live reconfiguration.
- `markdown-input.ts`: wrap-only characters and code fence completion.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`plugins.autoPair.enabled`, `autoPair.brackets` and `autoPair.markdown` under
`markdownWorkshop` all default to true. No palette commands.

## Limits and differences from Obsidian

Uses CodeMirror's pairing rules and Markdown language data. The plugin does not
set editor-wide indentation or tab width. The pairing measured in Obsidian is
listed in `docs/OBSIDIAN_KEYS.md`.
