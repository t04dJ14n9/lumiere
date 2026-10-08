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

## Services, events and settings

Injects `editor`, `livePreview` and `render`; provides no service. Listens to
`render/postProcess`; emits no kernel events. `markdownWorkbench.plugins.codeBlocks.enabled`
defaults to true. No palette commands or default keybindings.

## Limits and differences from Obsidian

Languages without a loaded Prism grammar remain plain code. Selection/reveal
uses Markdown source offsets and VS Code owns undo and saving. Exact visual
parity remains for the owner's comparison.
