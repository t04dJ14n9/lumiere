import type { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";

/**
 * The source a code block renders from. An indented code block's node starts
 * after its indentation, which is what makes it code, so it covers whole
 * lines; without that it rendered as a paragraph beside an empty indent.
 */
export function codeBlockRange(
  node: Pick<SyntaxNodeRef, "name" | "from" | "to">,
  state: EditorState,
): { from: number; to: number } {
  return node.name === "CodeBlock"
    ? { from: state.doc.lineAt(node.from).from, to: node.to }
    : { from: node.from, to: node.to };
}
