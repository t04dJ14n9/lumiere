# Live Preview

Core `livePreview` plugin. Its registrations belong to the plugin context and are
removed on disposal. See DESIGN.md for its service and lifecycle contract.

Core Phase 3 is implemented; owner visual acceptance is pending.

Core block renderers now send rules, HTML and code blocks through `render`.
Later registrations override a core renderer for the same node. The widget
owns the async render pass until destruction. Source mode and fiber disposal
remove decorations. Motion functions are tested with EditorState; whole-file
blocks have no outside Escape destination. Visual parity awaits owner testing.
