import type { EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { footnotes } from "../../markdown/metadata/footnotes";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type { InlineContext, InlineRenderer } from "../livePreview/api";
import type { RenderService } from "../render/api";
import { FootnoteReference, referenceText } from "./reference-widget";

/**
 * Footnotes in Live Preview, LaTeX paper style (a deliberate departure from
 * Obsidian): a reference shows as a superscript number in order of first
 * reference, and a definition as that number leading its text. Selections,
 * Ctrl+A included, keep both rendered; only a caret inside a reference, or
 * on a definition's `[^label]:` marker, shows the faint source for editing.
 */
export function footnoteInline(render: RenderService): InlineRenderer {
  return {
    nodes: ["FootnoteRef", "InlineFootnote"],
    decorate(node, cx) {
      const registry = footnotes(cx.state.doc);
      const definition = registry.definitions.find(
        (note) => note.label && note.marker === node.from,
      );
      if (definition) {
        decorateDefinition(cx, definition);
        return;
      }
      const note = registry.references.get(node.from);
      if (!note) {
        return;
      }
      if (hasCaretWithin(cx.state, node.from, node.to)) {
        markReferenceSource(cx, node.from, node.to, note);
        return;
      }
      cx.replace(node.from, node.to, new FootnoteReference(note, render));
    },
  };
}

/**
 * Whether a caret (an empty selection range) sits in `from`–`to`, ends
 * included so the caret beside a widget can reach its source. A non-empty
 * selection over the range does not count: it keeps the rendering.
 */
export function hasCaretWithin(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return state.selection.ranges.some(
    (range) => range.empty && range.head >= from && range.head <= to,
  );
}

/**
 * A reference under the caret: faint `[^label]` source; an inline footnote
 * keeps its text readable between faint `^[` and `]`.
 */
function markReferenceSource(
  cx: InlineContext,
  from: number,
  to: number,
  note: Footnote,
): void {
  if (note.label) {
    cx.mark(from, to, "md-syntax-mark");
    return;
  }
  cx.mark(from, from + 2, "md-syntax-mark");
  cx.mark(to - 1, to, "md-syntax-mark");
}

function decorateDefinition(cx: InlineContext, note: Footnote): void {
  const doc = cx.state.doc;
  const markerEnd = Math.min(note.marker + note.label.length + 4, doc.length);
  if (hasCaretWithin(cx.state, note.marker, markerEnd)) {
    cx.mark(note.marker, markerEnd, "mw-footnote-marker");
  } else {
    // The space after `]:` goes with the marker; the number keeps its own gap.
    const spaceEnd = doc.sliceString(markerEnd, markerEnd + 1) === " " ? 1 : 0;
    cx.replace(
      note.marker,
      markerEnd + spaceEnd,
      new DefinitionNumber(referenceText(note)),
    );
  }
  const first = doc.lineAt(note.marker);
  const last = doc.lineAt(Math.min(note.to, doc.length));
  for (let line = first.number; line <= last.number; line++) {
    cx.line(
      doc.line(line).from,
      line === first.number
        ? "mw-footnote-def"
        : "mw-footnote-def is-continued",
    );
  }
}

/** The superscript number that leads a rendered definition. */
export class DefinitionNumber extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  override eq(other: DefinitionNumber): boolean {
    return other instanceof DefinitionNumber && other.text === this.text;
  }
  override toDOM(): HTMLElement {
    const sup = document.createElement("sup");
    sup.className = "mw-footnote-number";
    sup.textContent = this.text;
    return sup;
  }
}
