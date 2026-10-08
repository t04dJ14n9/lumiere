# Footnotes

Render numbered footnote references with hover/focus previews and definition
navigation, like Obsidian's Live Preview footnotes. Insert a footnote in one edit.

## How it works

Shared metadata supplies numbering, definitions and reference ranges. Inline
widgets and references inside rendered blocks mount the same accessible control.
Render preprocessing resolves references against the owning note and substitutes
opaque placeholders; postprocessing mounts controls with pass-owned cleanup.
Changing definitions invalidates rendered blocks. Plugin disposal removes all
remaining references, render passes, listeners and commands.

## Files

- `manifest.ts`: feature identity and Insert Footnote contribution.
- `webview.ts`: named invalidation, theme, renderer and command registrations.
- `preprocess.ts`: pure reference resolution and placeholder substitution.
- `render-references.ts`: pass reference registry and mounted-control lifetime.
- `reference-widget.ts`: reference widget and hover/focus preview control.
- `definition-widget.ts`: multiline definition display and back-references.
- `edit.ts`: insertion with an unused definition label.
- `footnotes.test.ts`: insertion unit coverage.
- `preprocess.test.ts`: owning-note numbering, missing and repeated references.

## Services, events and settings

Injects `editor`, `commands`, `livePreview`, `render` and `rpc`; provides no
service. Listens to `render/preProcess` and `render/postProcess`, emits
`render/changed`, and uses `links.open` RPC for embedded-note navigation.
The feature switch is `markdownWorkbench.plugins.footnotes.enabled`.

## Limits and differences from Obsidian

Editing and undo use the native TextDocument. Definition ranges include multiline
continuations. Preview ancestry prevents recursive footnote enhancement. Rendered
embedded-note links re-enter the host's authorized navigation path.
