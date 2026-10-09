import { footnotes } from "../../markdown/metadata/footnotes";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type { InlineContext, InlineRenderer } from "../livePreview/api";
import type { RenderService } from "../render/api";
import { FootnoteReference } from "./reference-widget";

/**
 * Footnotes in Live Preview, as in Obsidian: a reference shows as a compact
 * superscript number (source at the caret), and a definition stays editable
 * source whose `[^label]:` marker is muted.
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
      if (note && !cx.revealed(node.from, node.to)) {
        cx.replace(node.from, node.to, new FootnoteReference(note, render));
      }
    },
  };
}

function decorateDefinition(cx: InlineContext, note: Footnote): void {
  const doc = cx.state.doc;
  const markerEnd = note.marker + note.label.length + 4;
  cx.mark(note.marker, Math.min(markerEnd, doc.length), "mw-footnote-marker");
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
