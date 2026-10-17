import { EditorSelection } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { CLICK_DRAG_PX, latchClickDrag } from "../../webview/ui/block-pointer";

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
  /** Doc identity at record time; skip correction if the doc object changed. */
  readonly doc: { readonly length: number };
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
  currentDoc: { readonly length: number };
}): boolean {
  const { candidate } = input;
  if (
    input.dragged ||
    !candidate ||
    // Intervening edit: head may be numerically unchanged while domPos is stale.
    input.currentDoc !== candidate.doc ||
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
class ClickPositionSync {
  private press: Press | null = null;
  private readonly doc: Document;

  constructor(private readonly view: EditorView) {
    this.doc = view.dom.ownerDocument;
    view.dom.addEventListener("mousedown", this.onDown, true);
    this.doc.addEventListener("mousemove", this.onMove, true);
    this.doc.addEventListener("mouseup", this.onUp, true);
  }

  private readonly onDown = (event: MouseEvent): void => {
    this.press =
      event.button === 0
        ? {
            x: event.clientX,
            y: event.clientY,
            dragged: false,
            candidate: null,
          }
        : null;
  };

  private readonly onMove = (event: MouseEvent): void => {
    if (this.press) {
      latchClickDrag(this.press, event.clientX, event.clientY, CLICK_DRAG_PX);
    }
  };

  private readonly onUp = (): void => {
    const active = this.press;
    // Clear after the microtask so a same-turn select.pointer can still record
    // a candidate, then apply only once the gesture is known to be a click.
    queueMicrotask(() => {
      this.press = null;
      if (active && this.view.dom.isConnected) {
        this.applySettledCorrection(active);
      }
    });
  };

  private applySettledCorrection(active: Press): void {
    const selection = this.view.state.selection.main;
    if (
      !active.candidate ||
      !shouldApplySettledPointerCorrection({
        dragged: active.dragged,
        candidate: active.candidate,
        currentEmpty: selection.empty,
        currentHead: selection.head,
        currentDoc: this.view.state.doc,
      })
    ) {
      return;
    }
    this.view.dispatch({
      selection: EditorSelection.cursor(active.candidate.domPos),
      scrollIntoView: false,
    });
  }

  update(update: ViewUpdate): void {
    const active = this.press;
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
    active.candidate = this.recordCandidate(update.state, active);
  }

  private recordCandidate(
    state: EditorState,
    active: Press,
  ): PointerClickCandidate | null {
    if (!state.selection.main.empty) {
      return null;
    }
    const head = state.selection.main.head;
    const domPos = domCaretPosition(this.view, {
      clientX: active.x,
      clientY: active.y,
    });
    if (domPos === undefined) {
      return null;
    }
    const sameLine =
      state.doc.lineAt(domPos).number === state.doc.lineAt(head).number;
    return { head, domPos, sameLine, doc: state.doc };
  }

  destroy(): void {
    this.view.dom.removeEventListener("mousedown", this.onDown, true);
    this.doc.removeEventListener("mousemove", this.onMove, true);
    this.doc.removeEventListener("mouseup", this.onUp, true);
  }
}

export const clickPositionSync = ViewPlugin.fromClass(ClickPositionSync);
