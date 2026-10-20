# Callouts

Displays Obsidian-style callouts, including nested and foldable callouts, in Live
Preview. Insert Callout quotes selected lines; the caret reveals callout source.

## How it works

A block renderer recognizes callout blockquotes and uses the shared sanitized
render service. The post-processor binds disclosures to panel-local memory.
That memory is a `folds` view-state contribution, restored on registration and
mapped across renamed source identities. Each pass owns its event listeners and
bindings; plugin disposal removes registrations and remaining pass handlers.
The fold button toggles disclosure; a `-` callout starts closed. Clicking title
text, body or padding reveals and selects the whole callout source, as does its
Edit button. Typing replaces that visible selection. Links and controls keep
their own clicks; keyboard navigation can reveal source with a caret.

## Files

- `manifest.ts`: enablement and Insert Callout contribution.
- `webview.ts`: renderer, disclosure and command registrations.
- `edit.ts`: callout detection and pure insertion edits.
- `view-state.ts`: disclosure memory, live bindings and source remapping.
- `callouts.test.ts`: recognition and insertion units.
- `view-state.test.ts`: persistence, restore and source-remapping units.
- `disclosure.test.ts`: title/chevron toggling and listener disposal.
- `../../../test/unit/callouts/interaction.test.ts`: rendered-click and button source editing.
- `callouts.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `commands`, `render` and `livePreview`; provides no service.
Listens to `render/postProcess`; emits no kernel events. Contributes `folds` to
editor view state. `lumiere.markdown.plugins.callouts.enabled` defaults to true.
Insert Callout has no default keybinding.

## Limits and differences from Obsidian

Colors follow VS Code's theme rather than Obsidian assets. Disclosure state belongs
to each panel, while text and undo belong to VS Code. Exact visual parity awaits
the owner's manual comparison.
