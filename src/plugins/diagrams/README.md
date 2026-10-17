# Diagrams

Renders Mermaid code fences as diagrams, like Obsidian's Mermaid support in
Live Preview. The diagram stays rendered on ordinary clicks — including
transparent gaps between nodes and empty chrome beside the SVG (no fence
caret jump / re-render flash). Reveal source with a double-click, the Edit
button, or by moving the caret into the fence. Clicking elsewhere in the note
does not collapse it to raw source.

## How it works

The block renderer recognizes Mermaid fences and delegates display to the shared
render service. A fence listener queues lazy Mermaid conversions, using strict
security and disabling HTML labels. Sanitized SVG replaces the original fence.
Pass and plugin disposal restore the source and prevent late results from writing.

## Files

- `manifest.ts`: feature metadata and default enablement.
- `webview.ts`: language recognition, block and fence registrations.
- `renderer.ts`: serial rendering queue, per-render cancellation and cleanup.
- `diagrams.test.ts`: language recognition unit coverage.
- `diagrams.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `livePreview` and `render`; provides no services. Listens to `render/fence`;
emits no events. `markdownWorkshop.plugins.diagrams.enabled` defaults to true.
No commands or default keybindings.

## Limits and differences from Obsidian

HTML labels are disabled and SVG is sanitized. Theme is chosen from the VS Code
light/dark theme when rendering. Live-reference visual parity remains for the
owner's manual comparison.
