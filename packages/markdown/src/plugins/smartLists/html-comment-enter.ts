import { EditorSelection } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { continuationPrefix } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Enter / Shift+Enter inside an HTML comment must not split the comment
 * (`<!--|x-->` → `<!--\n|x-->` breaks CommentBlock / Comment). Exit after
 * the comment node instead (BH-097 / ATX exit BH-084 parity).
 *
 * Claims only when the caret is strictly inside the node (not at either
 * edge), so a break before/after the comment still works.
 */
export function exitHtmlComment(target: Target, soft: boolean): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const caret = range.head;
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = tree.resolveInner(caret, -1);
  while (node) {
    if (node.name === "CommentBlock" || node.name === "Comment") {
      if (caret > node.from && caret < node.to) {
        const line = state.doc.lineAt(caret);
        const below = soft ? continuationPrefix(line.text) : "";
        // Prefer quote/list prefix from the comment's own line when the
        // comment sits under markup (`> <!--|x-->`).
        const insert = state.lineBreak + below;
        target.dispatch(
          state.update({
            changes: { from: node.to, insert },
            selection: EditorSelection.cursor(node.to + insert.length),
            scrollIntoView: true,
            userEvent: "input",
          }),
        );
        return true;
      }
      return false;
    }
    node = node.parent;
  }
  return false;
}
