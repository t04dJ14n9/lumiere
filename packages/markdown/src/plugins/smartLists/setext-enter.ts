import { EditorSelection } from "@codemirror/state";
import type { ChangeSpec, EditorState, Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Enter / Shift+Enter inside a setext heading exits below the underline
 * (BH-059 / BH-076) — instead of splitting the title from `===`/`---` and
 * breaking the heading.
 */
export function exitSetextHeading(target: Target): boolean {
  const { state } = target;
  const caret = state.selection.main.head;
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = tree.resolveInner(caret, caret === 0 ? 1 : -1);
  while (node && !/^SetextHeading[1-6]$/.test(node.name)) {
    node = node.parent;
  }
  if (!node) {
    return false;
  }
  const title = state.doc.lineAt(node.from);
  const onTitle = state.doc.lineAt(caret).number === title.number;
  // At title start: leave heading intact and exit below (same as EOL).
  const suffix =
    onTitle && caret > title.from ? title.text.slice(caret - title.from) : "";
  const after = node.to;
  const changes: ChangeSpec[] =
    suffix.length > 0
      ? [
          { from: caret, to: title.to, insert: "" },
          { from: after, insert: state.lineBreak + suffix },
        ]
      : [{ from: after, insert: state.lineBreak }];
  const set = state.changes(changes);
  target.dispatch(
    state.update({
      changes: set,
      selection: EditorSelection.cursor(set.mapPos(after, 1) - suffix.length),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}
