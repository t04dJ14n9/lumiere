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
render service. A fence listener queues the diagram, which renders as soon as
CodeMirror mounts its widget (the viewport plus a margin of about a screen), as
in Obsidian. So a reader usually meets diagrams already drawn, and their height
changes off screen, where scroll anchoring hides it. Renders run one at a time,
a frame apart, nearest the window first, because Mermaid keeps shared state; a
diagram scrolled past before its turn waits until it is mounted again. An SVG
cache paints a source rendered before at once. Strict security; HTML labels off
until Allow. Sanitized SVG replaces the original fence,
and any `.internal-link` SVG nodes are wired to the `links` protocol.
Pass and plugin disposal restore the source and prevent late results from writing.

## Files

- `manifest.ts`: feature metadata and default enablement.
- `webview.ts`: language recognition, block and fence registrations, and link opening.
- `renderer.ts`: Mermaid engine calls, `.internal-link` node wiring, per-render cancellation and cleanup.
- `mount-queue.ts`: the render queue (start on mount, one at a time, nearest first) and the SVG cache.
- `diagrams.test.ts` / `mount-queue.test.ts`: language recognition, editing, and render-queue coverage.
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
