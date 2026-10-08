# Code blocks

Registers reveal-on-caret code block widgets and the pinned source's viewport
highlighter for editable fences. Prism grammars load in a separate lazy chunk.
Rendered blocks have a copy button and map highlighted clicks to source offsets.

Injects editor, livePreview and render. Render listeners, CodeMirror extensions,
buttons and asynchronous callbacks are owned by the plugin or render pass.
External processors are added in Phase 7; unclaimed fences remain readable code.
