import {
  EditorSelection,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

/**
 * Toggle Comment, as Obsidian 1.14 does it (measured): wrap the selection, or
 * the word at the caret, in `%%…%%` and keep it selected; with nothing to
 * wrap, insert an empty comment around the caret. Inside a comment, remove
 * its markers (spaces inside them stay, as in Obsidian).
 */
export function toggleComment(state: EditorState): TransactionSpec {
  return {
    ...state.changeByRange((range) => toggleAt(state, range)),
    userEvent: "input",
  };
}

function toggleAt(state: EditorState, range: SelectionRange) {
  const comment = enclosingComment(state, range);
  if (comment) {
    const changes = state.changes([
      { from: comment.from, to: comment.from + 2 },
      { from: comment.to - 2, to: comment.to },
    ]);
    return { changes, range: range.map(changes) };
  }
  const word = range.empty ? state.wordAt(range.head) : null;
  const from = word?.from ?? range.from;
  const to = word?.to ?? range.to;
  const changes = [
    { from, insert: "%%" },
    { from: to, insert: "%%" },
  ];
  if (word || range.empty) {
    return { changes, range: EditorSelection.range(from + 2, to + 2) };
  }
  return {
    changes,
    range: EditorSelection.range(range.anchor + 2, range.head + 2),
  };
}

/** The `%%` comment the range lies in, if any. */
function enclosingComment(
  state: EditorState,
  range: SelectionRange,
): { from: number; to: number } | undefined {
  for (const side of [1, -1] as const) {
    for (
      let node: SyntaxNode | null = syntaxTree(state).resolveInner(
        range.from,
        side,
      );
      node;
      node = node.parent
    ) {
      if (
        node.name === "ObsidianComment" &&
        node.from <= range.from &&
        node.to >= range.to
      ) {
        return { from: node.from, to: node.to };
      }
    }
  }
  return undefined;
}
