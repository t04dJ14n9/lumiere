# Vault Graph

Draws notes as a directed graph in its own panel, similar to Obsidian's graph
view. The scope can be one OKF bundle or the **whole vault**.

## How it works

**Open Vault Graph** prefers the active note's OKF bundle when unambiguous,
offers **Whole vault** plus any bundles when choosing, and falls back to the
whole vault when no OKF bundles exist. The host builds a concept graph from
Markdown files in that scope, drops reserved `index.md` and `log.md`, and
aggregates body links, note embeds and frontmatter wikilinks. A worker lays
the drawing out. The panel reads the worker script from the extension and
starts it from a blob URL, which a webview is allowed to do. Filtering and
later edits keep coordinates; a large change waits for **Re-layout**.
Clicking a node asks the host to open that note. The host checks the scope, the
snapshot generation and that the id is still in the drawing.

## Files

- `manifest.ts`: caps, mode, depth, color and the two commands.
- `protocol.ts`: snapshot, view, ready and open RPC.
- `project.ts`: directed concept graph.
- `filters.ts`: facet filters and the local neighbourhood.
- `admission.ts`: hard caps on nodes, edges and payload bytes.
- `view.ts`: color, legend and the drawn view.
- `facets.ts`: unfiltered type, tag and folder choices.
- `scope.ts`: which bundle to use, with no workspace-folder guess.
- `choose.ts`: the picker around that decision.
- `collect.ts`: bundle files and indexing completeness.
- `snapshot.ts`: the payload the panel is allowed to receive.
- `settings.ts`: clamped window settings.
- `session.ts`: one panel, its endpoint and rebuilds.
- `host.ts`: commands and vault listeners.
- `html.ts`: the panel document and its content security policy.
- `project.test.ts`, `scope.test.ts`, `snapshot.test.ts`: builder, scope and admission.

The panel script and layout worker live in `src/webview/graph/` and are not
part of the editor bundle.

## Services, events and settings

Injects the host services `hostCommands`, `dialogs`, `views`, `activeEditor` and `settings`, `vaults` and `okf`. Provides nothing. Listens to
`vault/changed` and `vault/resolved`. Commands are
`lumiere.markdown.graph.open` and `lumiere.markdown.graph.chooseBundle` (scope picker).
Settings: `lumiere.markdown.graph.maxNodes` (2000), `maxEdges` (20000),
`defaultMode` (`global`), `localDepth` (2) and `colorBy` (`type`).

## Limits and differences from Obsidian

The graph scope is one OKF bundle or the whole vault (picker includes
**Whole vault**). Edges are directed and come from body links, note embeds,
frontmatter wikilinks, and OKF `sources` rows whose `resource` is a vault path
(http(s) sources stay off the graph). Caps are hard: 2000 notes, 20000
aggregated edges and 1.5 MB. A larger graph is refused, not sampled. There is
no 3D view, saved layout or trust badge. Layout is a bounded force pass in a
worker that stops while the panel is hidden and when the panel closes.
