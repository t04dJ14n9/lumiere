import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { blockIndex } from "./blocks";
import { revealed } from "./registry";

/** Escape prefers the following line; at EOF it returns to the preceding line. */
export function escapeBlock(state: EditorState): number | undefined {
  const head = state.selection.main.head;
  const block = state
    .field(blockIndex, false)
    ?.find((item) => item.from <= head && head <= item.to);
  if (!block) {
    return undefined;
  }
  const line = state.doc.lineAt(block.to);
  if (line.to < state.doc.length) {
    return line.to + 1;
  }
  return block.from > 0 ? block.from - 1 : undefined;
}

/** Skip a rendered block on vertical entry, leaving revealed source to CodeMirror. */
export function verticalBlock(
  state: EditorState,
  direction: -1 | 1,
): number | undefined {
  if (!state.selection.main.empty) {
    return undefined;
  }
  const line = state.doc.lineAt(state.selection.main.head);
  const next = line.number + direction;
  if (next < 1 || next > state.doc.lines) {
    return undefined;
  }
  const target = state.doc.line(next);
  const block = state
    .field(blockIndex, false)
    ?.find(
      (item) =>
        item.from <= target.to &&
        item.to >= target.from &&
        !revealed(state, item.from, item.to),
    );
  if (!block) {
    return undefined;
  }
  return direction > 0
    ? Math.min(state.doc.length, state.doc.lineAt(block.to).to + 1)
    : Math.max(0, state.doc.lineAt(block.from).from - 1);
}

export function moveTo(target: (state: EditorState) => number | undefined) {
  return (view: EditorView): boolean => {
    const anchor = target(view.state);
    if (anchor === undefined) {
      return false;
    }
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    return true;
  };
}
