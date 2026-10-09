import { footnotes } from "../../markdown/metadata/footnotes";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type { InlineContext, InlineRenderer } from "../livePreview/api";
import type { RenderService } from "../render/api";
import { FootnoteReference } from "./reference-widget";

/**
 * Footnotes in Live Preview, as in Obsidian 1.14: a reference shows as a
 * small superscript `[^label]` (or `^[text]` inline) with faint brackets,
 * and a definition stays editable text led by its label in superscript.
 * A reference keeps that look under the caret or a selection, as editable
 * text; a definition shows its faint `[^label]:` source while the caret
 * or a selection touches it.
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
      if (cx.revealed(node.from, node.to)) {
        markReferenceSource(cx, node.from, node.to);
        return;
      }
      cx.replace(
        node.from,
        node.to,
        new FootnoteReference(note, render, "source"),
      );
    },
  };
}

/**
 * A reference at the caret or in a selection: the same superscript with
 * faint brackets, as marks over its source so it can be edited in place.
 */
function markReferenceSource(
  cx: InlineContext,
  from: number,
  to: number,
): void {
  cx.mark(from, to, "mw-footnote-ref is-source is-editing");
  cx.mark(from, from + 2, "mw-footnote-bracket");
  cx.mark(to - 1, to, "mw-footnote-bracket");
}

function decorateDefinition(cx: InlineContext, note: Footnote): void {
  const doc = cx.state.doc;
  const markerEnd = Math.min(note.marker + note.label.length + 4, doc.length);
  if (cx.revealed(note.marker, markerEnd)) {
    cx.mark(note.marker, markerEnd, "mw-footnote-marker");
  } else {
    const labelFrom = note.marker + 2;
    const labelTo = labelFrom + note.label.length;
    cx.hide(note.marker, labelFrom);
    cx.mark(labelFrom, labelTo, "mw-footnote-label");
    cx.hide(labelTo, markerEnd);
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
