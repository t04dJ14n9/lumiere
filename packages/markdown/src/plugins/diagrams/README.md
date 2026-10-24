# Diagrams

Renders Mermaid code fences as diagrams, like Obsidian's Mermaid support in
Live Preview. As in Obsidian, the diagram stays rendered on clicks and
double-clicks, including transparent gaps between nodes and the margin beside
it. The Edit button reveals the source with the diagram's code selected, as
does moving the caret into the fence.

Nodes styled with `class NodeName internal-link;` (or `:::internal-link`) become
clickable internal links that open the vault note matching the node's label text
(or node ID fallback when the label is empty).

## How it works

The block renderer recognizes Mermaid fences and delegates display to the shared
render service. A fence listener queues lazy Mermaid conversions, using strict
security and disabling HTML labels. Sanitized SVG replaces the original fence,
and any `.internal-link` SVG nodes are wired to the `links` protocol.
Pass and plugin disposal restore the source and prevent late results from writing.

## Files

- `manifest.ts`: feature metadata and default enablement.
- `webview.ts`: language recognition, block and fence registrations, and link opening.
- `renderer.ts`: serial rendering queue, `.internal-link` node wiring, per-render cancellation and cleanup.
- `diagrams.test.ts`: language recognition and editing unit coverage.
- `diagrams.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `livePreview` and `render`, and optionally `rpc`; provides no services. Listens to `render/fence`;
emits no events. `lumiere.markdown.plugins.diagrams.enabled` defaults to true.
No commands or default keybindings.

## Limits and differences from Obsidian

HTML labels are disabled and SVG is sanitized. Theme is chosen from the VS Code
light/dark theme when rendering. A failed render uses Obsidian's
`mermaid-wrapper.is-guarded` chrome (title, error, Allow, source). Allow persists vault trust (`lumiere.mermaid-vault-trust`, Obsidian `mermaid-vault-trust`) and retries with `htmlLabels: true`; SVG output is still sanitized. Untrusted renders keep `htmlLabels: false`.
Live-reference visual parity remains for the owner's manual comparison.
