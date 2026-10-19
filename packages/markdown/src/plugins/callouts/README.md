# Callouts

Displays Obsidian-style callouts, including nested and foldable callouts, in Live
Preview. Insert Callout quotes selected lines; the caret reveals callout source.

## How it works

A block renderer recognizes callout blockquotes and uses the shared sanitized
render service. The post-processor binds disclosures to panel-local memory.
That memory is a `folds` view-state contribution, restored on registration and
mapped across renamed source identities. Each pass owns its event listeners and
bindings; plugin disposal removes registrations and remaining pass handlers.
Foldable titles toggle disclosure; a `-` callout starts closed. Pointer clicks
in the body or padding keep the callout rendered. Its Edit button reveals
source, as does moving the caret into the block with the keyboard.

## Files

- `manifest.ts`: enablement and Insert Callout contribution.
- `webview.ts`: renderer, disclosure and command registrations.
- `edit.ts`: callout detection and pure insertion edits.
- `view-state.ts`: disclosure memory, live bindings and source remapping.
- `callouts.test.ts`: recognition and insertion units.
- `view-state.test.ts`: persistence, restore and source-remapping units.
- `disclosure.test.ts`: title/chevron toggling and listener disposal.
- `../../../test/unit/callouts/interaction.test.ts`: button-only source editing.
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
