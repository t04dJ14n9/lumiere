import type { SyntaxNodeRef } from "@lezer/common";
import type { InlineContext } from "./api";

/**
 * Code blocks stay editable source lines in Live Preview, as in Obsidian, so
 * moving the caret in or out never changes the layout: every line keeps its
 * class (and so its height) either way. Outside the block only the fence text
 * is hidden; the fence lines stay, empty, as the block's top and bottom
 * padding (the codeBlocks plugin puts the language label in the opening one).
 */
export function decorateCodeLines(
  node: SyntaxNodeRef,
  context: Pick<InlineContext, "state" | "line" | "hide" | "revealed">,
): void {
  const { state } = context;
  if (node.name === "CodeBlock") {
    // An indented block's node starts after the first line's indentation.
    for (
      let line = state.doc.lineAt(node.from);
      ;
      line = state.doc.line(line.number + 1)
    ) {
      context.line(line.from, "md-code-line md-code-indented");
      if (line.to >= node.to || line.number === state.doc.lines) {
        break;
      }
    }
    return;
  }
  if (node.name !== "FencedCode") {
    return;
  }
  const open = state.doc.lineAt(node.from);
  const close = state.doc.lineAt(node.to);
  const closed =
    close.number > open.number && node.node.getChildren("CodeMark").length > 1;
  context.line(open.from, "md-code-fence md-code-fence-open");
  if (closed) {
    context.line(close.from, "md-code-fence md-code-fence-close");
  }
  if (context.revealed(open.from, close.to)) {
    return;
  }
  context.hide(open.from, open.to);
  if (closed) {
    context.hide(close.from, close.to);
  }
}
