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
export function completionEdit(
  state: EditorState,
  range: { from: number; to: number },
  insert: string,
  closeLink: boolean | "replace",
): TransactionSpec {
  const suffix = closeLink === true ? "]]" : "";
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
