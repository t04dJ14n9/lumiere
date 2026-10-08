# Live Preview

Renders Markdown in place and reveals syntax around the caret, like Obsidian's
Live Preview. Each panel can switch between Live Preview and Source mode.

## How it works

A shared document tree feeds block indexes and viewport inline decorations.
Feature renderers are selected in catalog rank order; generic core blocks use
the base slot. Caller-bound registrations retain the contributing plugin's owner.
The engine compartment switches presentation without replacing the document.
Inline decorations map through IME and mouse drags, then rebuild; rendered clicks
map visible text back to source before syntax is revealed.

## Files

- `manifest.ts`: core metadata and Toggle Source command.
- `api.ts`: renderer, inline context and service contracts.
- `host.ts`: native Toggle Source command routing.
- `webview.ts`: engine/service, invalidation, fallback and mode registrations.
- `registry.ts`: renderer facets and reveal rules.
- `document-tree.ts`: incremental document syntax tree.
- `blocks.ts`: block index, widget decorations and render revision.
- `inline.ts`: basic inline decoration builder and composition/drag lifetime.
- `rendered-position.ts`: visible-text projection and DOM-to-source mapping.
- `motion.ts`: Escape and vertical motion around rendered blocks.
- `core.test.ts`: reveal, motion, mode and lifecycle unit coverage.
- `inline.test.ts`: basic/custom decoration and line-deduplication units.

## Services, events and settings

Webview injects `editor`, `commands` and `render`; host injects `workbench` and
`editors`. Provides `livePreview`. Listens to
`render/changed` and `editor/modeRestored`; emits no kernel events. Initial mode
comes from `editor.defaultMode`; Toggle Source changes only the active panel.
Renderer registrations belong to their caller and dispose with that caller.

## Limits and differences from Obsidian

Source mode retains the inline title. A block covering the whole document has no
outside destination for Escape. Rendered-position mapping refuses mismatched DOM
text such as embedded media/math. VS Code owns text/undo; exact visual parity is
left to the owner's manual comparison.
