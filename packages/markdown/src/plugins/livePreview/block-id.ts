import type { SyntaxNodeRef } from "@lezer/common";
import type { InlineContext } from "./api";

/**
 * A block identifier (`^id` ending a paragraph) stays visible but faint, as
 * in Obsidian's Live Preview, so it reads as metadata rather than text.
 */
export function decorateBlockId(node: SyntaxNodeRef, cx: InlineContext): void {
  if (node.name !== "Paragraph") {
    return;
  }
  const last = cx.state.doc.lineAt(node.to);
  const id = /(?:^|[ \t])(\^[A-Za-z0-9-]+)[ \t]*$/.exec(
    cx.state.sliceDoc(last.from, node.to),
  );
  if (!id?.[1]) {
    return;
  }
  const from = last.from + id.index + id[0].indexOf(id[1]);
  cx.mark(from, from + id[1].length, "md-block-id");
}
