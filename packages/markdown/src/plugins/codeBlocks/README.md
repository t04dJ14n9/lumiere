# Code blocks

Shows syntax-highlighted code fences and indented code in Live Preview, with a
language label and Copy button, like Obsidian's code block editing.

## How it works

Code stays editable source lines in Live Preview, so the caret entering or
leaving a block never moves a line (Live Preview's `code-lines.ts` gives every
line its class and hides only the fence text). This plugin highlights fences
whether or not the caret is in them, and puts the language label and Copy
button (`fence-flair.ts`) in the hidden opening fence line, positioned so the
line keeps the height of the text it replaces. Only fences of a language a code
processor accepts are replaced by a rendered widget; that registration is
renewed whenever the processors change. Prism's core and language registry load
on the first labelled fence. Each requested language loads its own components,
dependencies, embedded syntax and grammar extensions, in dependency order;
aliases and concurrent requests share a promise. Rendered Markdown code also
loads languages named by its nested fences. Editable
highlighting caches token ranges by fence position, text and language and maps
existing decorations during composition. Rendered code (embeds, callouts,
processor output) gets copy controls and labels from render passes, which own
click handlers, original text and late-result guards.

## Files

- `manifest.ts`: feature metadata and default enablement.
- `webview.ts`: editable-source, block and post-processor registrations.
- `post-process.ts`: rendered highlighting, copy controls and source reveal.
- `code-source.ts`: viewport highlighting, cache and lazy-load lifecycle.
- `code-source.test.ts`: unit tests for rebuilding while reveal is frozen.
- `fence-flair.ts`: label and Copy button in the hidden opening fence line.
- `processor-view.ts`: code processor rendering and its fence widgets.
- `code-highlight.ts`: Prism HTML highlighting and UTF-16 token ranges.
- `language-loader.ts`: lazy grammar promises, alias sharing and retry after failure.
- `language-loader.test.ts`: no-request, alias, concurrent-load and retry units.
- `code-selection.ts`: highlighted DOM click to Markdown source coordinates.
- `vendor.d.ts`: Prism bundle typing.
- `test/unit/codeBlocks/languages.test.ts`: eager/lazy output parity and ESM chunk loading.
- `code.test.ts`: source-offset, fence reveal and fence info unit tests.
- `codeBlocks.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `livePreview` and `render`; provides no service. Listens to
`render/postProcess`; emits no kernel events. `lumiere.markdown.plugins.codeBlocks.enabled`
defaults to true. No palette commands or default keybindings.

## Limits and differences from Obsidian

Unsupported languages remain plain code; supported languages highlight after
their components arrive. Selection/reveal
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

Host injects `editors`, the host services `settings` and `workspace`, plus optional `vaults`, provides `codeBlocks`.
Webview additionally injects `rpc`, listens to `render/fence`, and emits
`render/changed` when available processors change. External processors are off in
untrusted workspaces; this differs from executing Obsidian plugin code in the UI.
The source-line value is a render-context hint, not a validated edit location.
