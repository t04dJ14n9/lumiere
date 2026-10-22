import { findClusterBreak, Prec, type EditorState } from "@codemirror/state";
import { Direction, EditorView } from "@codemirror/view";
import type { VimMode } from "../vim/api";

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

/**
 * Handle table boundaries before Vim's DOM handler consumes navigation keys.
 * `vimMode` reads the optional Vim service so this module never imports the
 * Vim adapter library on the cold path.
 */
export function cellNavigation(
  move: (step: CellStep, extend: boolean) => boolean,
  vimMode?: (view: EditorView) => VimMode | undefined,
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
        const key = navigationKey(event.key, vimMode?.(view));
        if (!key) {
          return false;
        }
        const step = cellArrow(view, key, event.shiftKey, vimMode);
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
  vimMode?: (view: EditorView) => VimMode | undefined,
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
    if (!atHorizontalBoundary(view, step.column, extend, vimMode)) {
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

export function navigationKey(
  key: string,
  vim: VimMode | undefined,
): ArrowKey | undefined {
  const motions: Partial<Record<string, ArrowKey>> = {
    h: "ArrowLeft",
    j: "ArrowDown",
    k: "ArrowUp",
    l: "ArrowRight",
  };
  if (canHopVimRow(key, vim)) {
    return motions[key];
  }
  if (hasPendingVimInput(vim)) {
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

function hasPendingVimInput(vim: VimMode | undefined): boolean {
  const input = vim?.inputState;
  if (!vim || !input) {
    return false;
  }
  return Boolean(
    input.operator ||
    input.keyBuffer?.length ||
    input.prefixRepeat?.length ||
    input.motionRepeat?.length,
  );
}

function canHopVimRow(key: string, vim: VimMode | undefined): boolean {
  if (!vim || vim.insertMode || vim.visualMode) {
    return false;
  }
  const input = vim.inputState;
  if (!input) {
    return false;
  }
  // Only counts and g may be abandoned by a normal-mode row hop. Operators,
  // visual selections and other prefixes stay with the cell's Vim buffer.
  return (
    !input.operator &&
    ["j", "k"].includes(key) &&
    // Vim keeps typed digits and the g prefix in its key buffer.
    /^(?:[1-9]\d*)?g?$/.test((input.keyBuffer ?? []).join(""))
  );
}

function atHorizontalBoundary(
  view: EditorView,
  column: number,
  extend: boolean,
  vimMode?: (view: EditorView) => VimMode | undefined,
): boolean {
  const vim = vimMode?.(view);
  const doc = view.state.doc;
  const end =
    vim && !vim.insertMode && !vim.visualMode && !extend
      ? findClusterBreak(doc.toString(), doc.length, false)
      : doc.length;
  return view.state.selection.main.head === (column < 0 ? 0 : end);
}
