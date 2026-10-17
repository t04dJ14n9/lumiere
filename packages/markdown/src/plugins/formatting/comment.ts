import {
  EditorSelection,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

/**
 * Toggle Comment, as Obsidian does it: wrap the selection, or the word at the
 * caret, in `%% … %%` and keep it selected; with nothing to wrap, insert an
 * empty comment around the caret. Inside a comment, remove its markers.
 *
 * Unlike Obsidian, removing a comment also removes the spaces just inside
 * its markers, which Obsidian leaves behind.
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
    const open =
      state.sliceDoc(comment.from, comment.from + 3) === "%% " ? 3 : 2;
    const close =
      comment.to - 3 >= comment.from + open &&
      state.sliceDoc(comment.to - 3, comment.to) === " %%"
        ? 3
        : 2;
    const changes = state.changes([
      { from: comment.from, to: comment.from + open },
      { from: comment.to - close, to: comment.to },
    ]);
    return { changes, range: range.map(changes) };
  }
  const word = range.empty ? state.wordAt(range.head) : null;
  const from = word?.from ?? range.from;
  const to = word?.to ?? range.to;
  const changes = [
    { from, insert: "%% " },
    { from: to, insert: " %%" },
  ];
  if (word || range.empty) {
    return { changes, range: EditorSelection.range(from + 3, to + 3) };
  }
  return {
    changes,
    range: EditorSelection.range(range.anchor + 3, range.head + 3),
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
