import { syntaxTree } from "@codemirror/language";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { Query } from "./protocol";

/** True when `pos` sits inside literal code or YAML frontmatter. */
export function inLiteralCodeOrFrontmatter(
  state: EditorState,
  pos: number,
): boolean {
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
      return true;
    }
    if (!node.parent) {
      return false;
    }
    node = node.parent;
  }
}

/**
 * Whether completions may open at `pos`. Link/heading/block stay out of
 * literal code and frontmatter; tags are allowed there (Obsidian 1.14.4).
 * Local lists (highlight colours) omit `kind` and stay blocked in literals.
 */
export function allowsSuggestions(
  state: EditorState,
  pos: number,
  kind?: Query["kind"],
): boolean {
  if (!inLiteralCodeOrFrontmatter(state, pos)) {
    return true;
  }
  return kind === "tag";
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
