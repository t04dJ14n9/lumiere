import { findClusterBreak, Prec, type EditorState } from "@codemirror/state";
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

/** Enter from an adjacent line, including the blank prose space created at EOF. */
export function entersTable(
  state: EditorState,
  bounds: { from: number; to: number },
  direction: -1 | 1,
): boolean {
  if (!state.selection.main.empty || state.selection.ranges.length !== 1) {
    return false;
  }
  const line = state.doc.lineAt(state.selection.main.head).number;
  const edge = direction < 0 ? bounds.to : bounds.from;
  const edgeLine = state.doc.lineAt(edge).number;
  if (line + direction === edgeLine) {
    return true;
  }
  // Leaving an EOF table creates a separator and a new empty prose line.
  return (
    direction < 0 &&
    line === edgeLine + 2 &&
    state.selection.main.head === state.doc.length &&
    !state.doc.line(line - 1).text &&
    !state.doc.sliceString(bounds.to).trim()
  );
}

/** Handle table boundaries before Vim's DOM handler consumes navigation keys. */
export function cellNavigation(
  move: (step: CellStep, extend: boolean) => boolean,
) {
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
        const key = navigationKey(event.key, getCM(view)?.state.vim);
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
  const steps: Record<ArrowKey, CellStep> = {
    ArrowLeft: { row: 0, column: -1 },
    ArrowRight: { row: 0, column: 1 },
    ArrowUp: { row: -1, column: 0 },
    ArrowDown: { row: 1, column: 0 },
  };
  const step = steps[key];
  return { row: step.row, column: step.column * (rtl ? -1 : 1) };
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
    if (!atHorizontalBoundary(view, step.column, extend)) {
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

function navigationKey(
  key: string,
  vim: NonNullable<ReturnType<typeof getCM>>["state"]["vim"],
): ArrowKey | undefined {
  const motions: Partial<Record<string, ArrowKey>> = {
    h: "ArrowLeft",
    j: "ArrowDown",
    k: "ArrowUp",
    l: "ArrowRight",
  };
  if (
    vim &&
    (vim.inputState.operator ||
      vim.inputState.keyBuffer.length ||
      vim.inputState.prefixRepeat.length ||
      vim.inputState.motionRepeat.length)
  ) {
    return undefined;
  }
  if (arrowKeys.includes(key as ArrowKey)) {
    return key as ArrowKey;
  }
  if (vim && !vim.insertMode && !vim.visualMode) {
    return motions[key];
  }
  return undefined;
}

function atHorizontalBoundary(
  view: EditorView,
  column: number,
  extend: boolean,
): boolean {
  const vim = getCM(view)?.state.vim;
  const doc = view.state.doc;
  const end =
    vim && !vim.insertMode && !vim.visualMode && !extend
      ? findClusterBreak(doc.toString(), doc.length, false)
      : doc.length;
  return view.state.selection.main.head === (column < 0 ? 0 : end);
}
