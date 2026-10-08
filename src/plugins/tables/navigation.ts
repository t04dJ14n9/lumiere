import { findClusterBreak, Prec } from "@codemirror/state";
import { Direction, EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";

export interface CellStep {
  row: number;
  column: number;
}

export const arrowKeys = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
] as const;
export type ArrowKey = (typeof arrowKeys)[number];

/** Handle table boundaries before Vim's DOM handler consumes navigation keys. */
export function cellNavigation(
  move: (step: CellStep, extend: boolean) => boolean,
) {
  const motions: Partial<Record<string, ArrowKey>> = {
    h: "ArrowLeft",
    j: "ArrowDown",
    k: "ArrowUp",
    l: "ArrowRight",
  };
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (
          event.isComposing ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        ) {
          return false;
        }
        const vim = getCM(view)?.state.vim;
        const normal = vim && !vim.insertMode && !vim.visualMode;
        const pending =
          vim &&
          (vim.inputState.operator ||
            vim.inputState.keyBuffer.length ||
            vim.inputState.prefixRepeat.length ||
            vim.inputState.motionRepeat.length);
        if (pending) {
          return false;
        }
        const key = arrowKeys.includes(event.key as ArrowKey)
          ? (event.key as ArrowKey)
          : normal
            ? motions[event.key]
            : undefined;
        if (!key) {
          return false;
        }
        const step = cellArrow(view, key, event.shiftKey);
        if (!step || !move(step, event.shiftKey)) {
          return false;
        }
        event.stopPropagation();
        return true;
      },
    }),
  );
}

export function arrowStep(key: ArrowKey, rtl = false): CellStep {
  const horizontal = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
  return {
    row: key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0,
    column: horizontal * (rtl ? -1 : 1),
  };
}

/** Keep ordinary text movement inside the cell until its visual boundary. */
export function cellArrow(
  view: EditorView,
  key: ArrowKey,
  extend: boolean,
): CellStep | undefined {
  const { selection, doc } = view.state;
  const caret = selection.main;
  if (
    view.composing ||
    selection.ranges.length !== 1 ||
    (!extend && !caret.empty)
  ) {
    return undefined;
  }
  const step = arrowStep(
    key,
    view.textDirectionAt(caret.head) === Direction.RTL,
  );
  if (step.column) {
    const vim = getCM(view)?.state.vim;
    const end =
      vim && !vim.insertMode && !vim.visualMode && !extend
        ? findClusterBreak(doc.toString(), doc.length, false)
        : doc.length;
    if (caret.head !== (step.column < 0 ? 0 : end)) {
      return undefined;
    }
  } else if (extend) {
    const boundary = view.moveToLineBoundary(caret, step.row > 0, true);
    if (boundary.head !== (step.row < 0 ? 0 : doc.length)) {
      return undefined;
    }
  } else {
    const next = view.moveVertically(caret, step.row > 0);
    const before = view.coordsAtPos(caret.head);
    const after = view.coordsAtPos(next.head);
    if (!before || !after || Math.abs(before.top - after.top) > 1) {
      return undefined;
    }
  }
  return step;
}
