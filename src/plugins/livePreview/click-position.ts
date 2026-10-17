import { EditorSelection } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import {
  CLICK_DRAG_PX,
  latchClickDrag,
} from "../../webview/ui/markdown-widget";

/**
 * Map a screen point to a document offset via the browser caret API.
 * More accurate than CodeMirror's `posAtCoords` for soft-wrapped CJK / wide
 * glyphs when the line also carries Live Preview hide decorations.
 */
export function domCaretPosition(
  view: EditorView,
  point: { clientX: number; clientY: number },
): number | undefined {
  const doc = view.contentDOM.ownerDocument;
  const caret = doc.caretRangeFromPoint?.(point.clientX, point.clientY);
  if (!caret || !view.contentDOM.contains(caret.startContainer)) {
    return undefined;
  }
  try {
    return view.posAtDOM(caret.startContainer, caret.startOffset);
  } catch {
    return undefined;
  }
}

/** Whether a settled pointer click should adopt the browser caret offset. */
export function shouldCorrectPointerClick(input: {
  empty: boolean;
  dragged: boolean;
  domPos: number | undefined;
  selectionHead: number;
  sameLine: boolean;
}): boolean {
  return (
    input.empty &&
    !input.dragged &&
    input.domPos !== undefined &&
    input.sameLine &&
    input.domPos !== input.selectionHead
  );
}

/** Candidate captured from a select.pointer update during an active press. */
export type PointerClickCandidate = {
  readonly head: number;
  readonly domPos: number;
  readonly sameLine: boolean;
};

/**
 * Whether a completed (button-up) gesture should adopt the DOM caret.
 * Correction must not run on the initial mousedown select.pointer — CM's
 * mouse-selection still owns that uncorrected anchor for a later drag.
 */
export function shouldApplySettledPointerCorrection(input: {
  dragged: boolean;
  candidate: PointerClickCandidate | null | undefined;
  currentEmpty: boolean;
  currentHead: number;
}): boolean {
  const { candidate } = input;
  if (
    input.dragged ||
    !candidate ||
    !shouldCorrectPointerClick({
      empty: true,
      dragged: false,
      domPos: candidate.domPos,
      selectionHead: candidate.head,
      sameLine: candidate.sameLine,
    })
  ) {
    return false;
  }
  // Already at the DOM offset, or another owner (e.g. Mermaid fence restore)
  // moved the selection away from the CM click head.
  if (input.currentHead === candidate.domPos) {
    return false;
  }
  return input.currentEmpty && input.currentHead === candidate.head;
}

type Press = {
  x: number;
  y: number;
  dragged: boolean;
  /** CM head / DOM caret from select.pointer; applied only after release. */
  candidate: PointerClickCandidate | null;
};

/**
 * After a plain click settles (button up, never dragged), if CodeMirror's
 * selection head disagrees with `caretRangeFromPoint` on the same source
 * line, adopt the browser offset. Does not correct on the initial mousedown
 * select.pointer — that would leave CM's drag-selection anchor uncorrected.
 * Skips cross-line jumps (widgets / gutters) and yields when another
 * selection owner has already moved the caret.
 */
export const clickPositionSync = ViewPlugin.define((view: EditorView) => {
  let press: Press | null = null;
  const doc = view.dom.ownerDocument;
  const onDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      press = null;
      return;
    }
    press = { x: event.clientX, y: event.clientY, dragged: false, candidate: null };
  };
  const onMove = (event: MouseEvent): void => {
    if (press) {
      latchClickDrag(press, event.clientX, event.clientY, CLICK_DRAG_PX);
    }
  };
  const applySettledCorrection = (active: Press): void => {
    if (
      !shouldApplySettledPointerCorrection({
        dragged: active.dragged,
        candidate: active.candidate,
        currentEmpty: view.state.selection.main.empty,
        currentHead: view.state.selection.main.head,
      })
    ) {
      return;
    }
    const next = active.candidate!.domPos;
    view.dispatch({
      selection: EditorSelection.cursor(next),
      scrollIntoView: false,
    });
  };
  const onUp = (): void => {
    const active = press;
    // Clear after the microtask so a same-turn select.pointer can still record
    // a candidate, then apply only once the gesture is known to be a click.
    queueMicrotask(() => {
      press = null;
      if (!active || !view.dom.isConnected) {
        return;
      }
      applySettledCorrection(active);
    });
  };
  view.dom.addEventListener("mousedown", onDown, true);
  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("mouseup", onUp, true);
  return {
    update(update: ViewUpdate): void {
      const active = press;
      if (
        !active ||
        active.dragged ||
        !update.selectionSet ||
        !update.transactions.some((tr) => tr.isUserEvent("select.pointer"))
      ) {
        return;
      }
      // Record only — never dispatch here. CM mouse-selection still owns the
      // mousedown anchor until release; correcting early makes a later drag
      // snap back to the uncorrected offset.
      if (!update.state.selection.main.empty) {
        active.candidate = null;
        return;
      }
      const head = update.state.selection.main.head;
      const domPos = domCaretPosition(view, {
        clientX: active.x,
        clientY: active.y,
      });
      if (domPos === undefined) {
        active.candidate = null;
        return;
      }
      const sameLine =
        update.state.doc.lineAt(domPos).number ===
        update.state.doc.lineAt(head).number;
      active.candidate = { head, domPos, sameLine };
    },
    destroy(): void {
      view.dom.removeEventListener("mousedown", onDown, true);
      doc.removeEventListener("mousemove", onMove, true);
      doc.removeEventListener("mouseup", onUp, true);
    },
  };
});
