# Auto pair

Automatically closes brackets, quotes and Markdown markers, corresponding to
Obsidian's Auto pair brackets and Auto pair Markdown syntax settings.

## How it works

CodeMirror's close-brackets input handler and empty-pair Backspace keymap use
language data from this plugin. Independent configuration flags select bracket
and Markdown families. A private compartment updates that data without replacing
the editor or unrelated plugin state; disposal removes the registrations.

## Files

- `manifest.ts`: enablement and bracket/Markdown configuration schema.
- `webview.ts`: pair selection, input/key registration and live reconfiguration.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`plugins.autoPair.enabled`, `autoPair.brackets` and `autoPair.markdown` under
`markdownWorkbench` all default to true. No palette commands.

## Limits and differences from Obsidian

Uses CodeMirror's pairing rules and Markdown language data. The plugin does not
set editor-wide indentation or tab width. Exact pairing edge cases are covered
by owner comparison rather than a claim of complete Obsidian parity.
