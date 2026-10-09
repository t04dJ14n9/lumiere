# Code blocks

Shows syntax-highlighted code fences and indented code in Live Preview, with a
Copy button and caret-based source reveal, like Obsidian's code block editing.

## How it works

The plugin registers generic code block renderers after more specific renderers.
Prism loads lazily for rendered code and selected editable fences. Editable
highlighting caches token ranges by fence position, text and language and maps
existing decorations during composition. Render passes own copy controls, click
handlers, original text and late-result guards.

## Files

- `manifest.ts`: feature metadata and default enablement.
- `webview.ts`: editable-source, block and post-processor registrations.
- `post-process.ts`: rendered highlighting, copy controls and source reveal.
- `code-source.ts`: viewport highlighting, cache and lazy-load lifecycle.
- `code-highlight.ts`: Prism HTML highlighting and UTF-16 token ranges.
- `code-selection.ts`: highlighted DOM click to Markdown source coordinates.
- `vendor.d.ts`: Prism bundle typing.
- `code.test.ts`: source-offset and fence selection unit tests.
- `codeBlocks.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `livePreview` and `render`; provides no service. Listens to
`render/postProcess`; emits no kernel events. `markdownWorkbench.plugins.codeBlocks.enabled`
defaults to true. No palette commands or default keybindings.

## Limits and differences from Obsidian

Languages without a loaded Prism grammar remain plain code. Selection/reveal
uses Markdown source offsets and VS Code owns undo and saving. Exact visual
parity remains for the owner's comparison.

Host-provided processors claim registered fence languages before generic code.
Only data (Markdown or HTML) crosses RPC; it passes through the normal sanitized
renderer. Generated tasks are read-only. Recursive output is bounded at eight
levels. Results cache by registry generation, language, source hash, URI and line
hint, with 64 completed entries. Disabling/replacing a provider cancels stale work.

- `api.ts`: host processor contract and caller ownership.
- `protocol.ts`: validated registry, request and result messages.
- `host.ts`: panel routing, trust, source containment and service lifetime.
- `processors.ts`: unique language ownership and late-result rejection.
- `processor-client.ts`: generation-aware cache and cancellation.
- `processor-view.ts`: fence interception and nested render-pass cleanup.

Host injects `editors`, `workbench` and optional `vaults`, provides `codeBlocks`.
Webview additionally injects `rpc`, listens to `render/fence`, and emits
`render/changed` when available processors change. External processors are off in
untrusted workspaces; this differs from executing Obsidian plugin code in the UI.
The source-line value is a render-context hint, not a validated edit location.
