import { EditorSelection } from "@codemirror/state";
import type { ChangeSpec, EditorState, Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

const quotePrefix = /^((?:[ \t]*>[ \t]?)*)/u;

/** Resolve a setext heading at `caret`, trying both inner biases. */
function setextAt(state: EditorState, caret: number): SyntaxNode | null {
  const tree = syntaxTree(state);
  // Prefer -1 (left) except at doc start; if that misses (e.g. caret on the
  // title text start after `> `), try +1 so quoted setext still exits.
  const biases: Array<-1 | 1> = caret === 0 ? [1, -1] : [-1, 1];
  for (const bias of biases) {
    let node: SyntaxNode | null = tree.resolveInner(caret, bias);
    while (node && !/^SetextHeading[1-6]$/.test(node.name)) {
      node = node.parent;
    }
    if (node) {
      return node;
    }
  }
  return null;
}

/**
 * Enter / Shift+Enter inside a setext heading exits below the underline
 * (BH-059 / BH-076) — instead of splitting the title from `===`/`---` and
 * breaking the heading. Quote prefixes are kept on the new line (BH-082:
 * `> Title|` / `> ===` → `> |` below the underline).
 */
export function exitSetextHeading(target: Target): boolean {
  const { state } = target;
  const caret = state.selection.main.head;
  const node = setextAt(state, caret);
  if (!node) {
    return false;
  }
  const title = state.doc.lineAt(node.from);
  const quotes = quotePrefix.exec(title.text)?.[1] ?? "";
  const contentStart = title.from + quotes.length;
  const onTitle = state.doc.lineAt(caret).number === title.number;
  // At/before title content start: leave heading intact and exit below.
  const suffix =
    onTitle && caret > contentStart ? title.text.slice(caret - title.from) : "";
  const after = node.to;
  const insert = state.lineBreak + quotes + suffix;
  const changes: ChangeSpec[] =
    suffix.length > 0
      ? [
          { from: caret, to: title.to, insert: "" },
          { from: after, insert },
        ]
      : [{ from: after, insert }];
  const set = state.changes(changes);
  // Cursor sits after the preserved quote prefix, before any moved suffix.
  const cursor = set.mapPos(after, 1) - suffix.length;
  target.dispatch(
    state.update({
      changes: set,
      selection: EditorSelection.cursor(cursor),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}
