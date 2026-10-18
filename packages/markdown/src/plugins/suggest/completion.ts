import { syntaxTree } from "@codemirror/language";
import type { EditorState, TransactionSpec } from "@codemirror/state";
/** Completion must not interpret literal code or frontmatter as prose. */
export function allowsSuggestions(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, -1);
  for (;;) {
    if (
      [
        "InlineCode",
        "FencedCode",
        "CodeBlock",
        "CodeText",
        "Frontmatter",
      ].includes(node.name)
    ) {
      return false;
    }
    if (!node.parent) {
      return true;
    }
    node = node.parent;
  }
}
/**
 * The edit that accepts a suggestion: `insert` over `range`, then `]]` when
 * `close` is set (reusing a `]]` already there), or the space `spaceAfter`
 * asks for unless one follows. `close: "replace"` replaces the whole link.
 */
export function completionEdit(
  state: EditorState,
  range: { from: number; to: number },
  insert: string,
  options: { close: boolean | "replace"; spaceAfter?: boolean },
): TransactionSpec {
  const closeLink = options.close;
  let suffix = "";
  if (closeLink === true) {
    suffix = "]]";
  } else if (
    options.spaceAfter &&
    !/^\s/u.test(state.sliceDoc(range.to, range.to + 1))
  ) {
    suffix = " ";
  }
  if (closeLink === "replace") {
    const line = state.doc.lineAt(range.from);
    const opening = state.sliceDoc(line.from, range.from).lastIndexOf("[[");
    if (opening >= 0) {
      range = { ...range, from: line.from + opening };
    }
  }
  const reused = closeLink && state.sliceDoc(range.to, range.to + 2) === "]]";
  return {
    changes: {
      from: range.from,
      to: range.to + (reused ? 2 : 0),
      insert: insert + suffix,
    },
    selection: { anchor: range.from + insert.length + suffix.length },
    userEvent: "input.complete",
  };
}
