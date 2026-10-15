# Spellcheck

Enables spelling checks in the editable note, corresponding to Obsidian's
Spellcheck setting.

## How it works

The plugin contributes the `spellcheck=true` contenteditable attribute through
Editor, above the editor's default. Removing the registration restores the default
without changing other content attributes or editor state.

## Files

- `manifest.ts`: enablement and empty configuration schema.
- `webview.ts`: owned spellcheck attribute registration.

## Services, events and settings

Injects `editor`; provides no service and listens to/emits no kernel events.
`markdownWorkshop.plugins.spellcheck.enabled` defaults to true. No commands
or keybindings.

## Limits and differences from Obsidian

Dictionaries and visible underlines come from the host browser/OS. No dictionary
or language selector is bundled; availability may differ between VS Code hosts.
