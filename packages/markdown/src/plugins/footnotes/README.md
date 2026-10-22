# Footnotes

Footnotes in LaTeX paper style, a deliberate departure from Obsidian's Live
Preview: a reference (`[^1]`, `[^note]` or an inline `^[text]`) shows as a
superscript number in the text colour, numbered in order of first reference
(named labels too; a repeated reference reuses its number), in Live Preview
and inside rendered blocks. An inline `^[text]` keeps its body visible after
the number (brackets hide; Obsidian shows the whole `^[text]` as superscript).
Selections, Ctrl+A included, keep it rendered; only a caret inside its source
shows the faint `[^label]` for editing. Hovering or focusing it previews the
footnote; clicking jumps to the definition (an inline footnote puts the caret
in itself). A definition shows the same number before its text, set a little
smaller; a selection touching its first line shows the faint `[^label]:`
source. Insert Footnote adds a reference and definition in one edit.

## How it works

Shared metadata supplies numbering, definitions and reference ranges. The
markdown dialect claims `[^label]:` lines before CommonMark link-reference
definitions, so a body that is only a link or URL still parses as a
paragraph with FootnoteRef (and Link / WikiLink) for Live Preview. The
inline renderer replaces each reference with a numbered widget unless a caret
(an empty selection) is inside its source, where it marks the source faint
(`md-syntax-mark`). It marks definition lines (`mw-footnote-def`,
`is-continued` for indented lines) and replaces a definition's `[^label]: `
with its number (`mw-footnote-number`), or marks the marker
(`mw-footnote-marker`) while a selection touches the first line. Inline widgets and
references inside rendered blocks mount the same accessible control.
Render preprocessing resolves references against the owning note and substitutes
opaque placeholders; postprocessing mounts controls with pass-owned cleanup.
Changing definitions invalidates rendered blocks. Plugin disposal removes all
remaining references, render passes, listeners and commands.

Insert Footnote works as in Obsidian 1.14: the reference goes before the
selection (the caret after it) and the definition at the end of the note,
one blank line after the text (including when the caret is at EOF on trailing
blanks — those blanks stay before the reference), and a popover under the
reference edits the definition: what is typed goes there, Enter continues it
on an indented line, and Escape or a click elsewhere closes it, back at the
reference (`definition-popover.ts`).
On an ATX or Setext heading, the reference goes in a new paragraph after the
whole heading so its text and outline entry stay intact.

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
- `../../../test/unit/footnotes/inline.test.ts`: reference and definition
  numbers, the caret inside a reference, selections, definition markers.
- `../../webview/ui/popover-position.ts` (shared with git blame): places the
  fixed hover preview inside the webview (moves it left at the right edge,
  opens it above near the bottom); unit-tested in
  `test/unit/webview/popover-position.test.ts` and
  `test/browser/footnotes.spec.ts`. Fixed positioning avoids `.cm-scroller`
  overflow clipping the tooltip.
- `footnotes.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `commands`, `livePreview`, `render` and `rpc`; provides no
service. Listens to `render/preProcess` and `render/postProcess`, emits
`render/changed`, and uses `links.open` RPC for embedded-note navigation.
The feature switch is `lumiere.markdown.plugins.footnotes.enabled`.

## Limits and differences from Obsidian

Editing and undo use the native TextDocument. Definition ranges include multiline
continuations. Obsidian's Live Preview shows a reference as its own
`[^label]` source; this plugin shows numbers instead (owner decision). Like
Obsidian's Live Preview there is no rendered footnotes
section and no back-reference links; Reading view does not exist here. Preview ancestry prevents recursive footnote enhancement. Rendered
embedded-note links re-enter the host's authorized navigation path.
