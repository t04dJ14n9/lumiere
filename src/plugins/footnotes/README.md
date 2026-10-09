# Footnotes

Footnotes as in Obsidian's Live Preview: a reference (`[^1]`, `[^note]` or an
inline `^[text]`) shows as a small superscript number in reading order, with
its source at the caret. Hovering or focusing it previews the footnote;
clicking jumps to the definition (an inline footnote reveals its source).
Definitions stay editable source with a muted `[^label]:` marker. Insert
Footnote adds a reference and definition in one edit.

## How it works

Shared metadata supplies numbering, definitions and reference ranges. The
inline renderer replaces each reference off the caret with a widget and marks
definition lines (`mw-footnote-def`, `is-continued` for indented lines) and
markers (`mw-footnote-marker`). Inline widgets and references inside rendered
blocks mount the same accessible control.
Render preprocessing resolves references against the owning note and substitutes
opaque placeholders; postprocessing mounts controls with pass-owned cleanup.
Changing definitions invalidates rendered blocks. Plugin disposal removes all
remaining references, render passes, listeners and commands.

## Files

- `manifest.ts`: feature identity and Insert Footnote contribution.
- `webview.ts`: named invalidation, renderer and command registrations.
- `inline.ts`: the Live Preview renderer for references and definitions.
- `preprocess.ts`: pure reference resolution and placeholder substitution.
- `render-references.ts`: pass reference registry and mounted-control lifetime.
- `reference-widget.ts`: reference widget, its number, and the hover/focus
  preview control.
- `edit.ts`: insertion with an unused definition label.
- `footnotes.test.ts`: insertion unit coverage.
- `preprocess.test.ts`: owning-note numbering, missing and repeated references.
- `../../../test/unit/footnotes/inline.test.ts`: reference numbers, reveal at
  the caret, definition lines and markers.
- `footnotes.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `commands`, `livePreview`, `render` and `rpc`; provides no
service. Listens to `render/preProcess` and `render/postProcess`, emits
`render/changed`, and uses `links.open` RPC for embedded-note navigation.
The feature switch is `markdownWorkbench.plugins.footnotes.enabled`.

## Limits and differences from Obsidian

Editing and undo use the native TextDocument. Definition ranges include multiline
continuations. Like Obsidian's Live Preview there is no rendered footnotes
section and no back-reference links; Reading view does not exist here. Preview ancestry prevents recursive footnote enhancement. Rendered
embedded-note links re-enter the host's authorized navigation path.
