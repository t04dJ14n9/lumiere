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

type Press = { x: number; y: number; dragged: boolean };

/**
 * After a plain click, if CodeMirror's selection head disagrees with
 * `caretRangeFromPoint` on the same source line, adopt the browser offset.
 * Does not run for drags or cross-line jumps (widgets / gutters).
 */
export const clickPositionSync = ViewPlugin.define((view: EditorView) => {
  let press: Press | null = null;
  const doc = view.dom.ownerDocument;
  const onDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      press = null;
      return;
    }
    press = { x: event.clientX, y: event.clientY, dragged: false };
  };
  const onMove = (event: MouseEvent): void => {
    if (press) {
      latchClickDrag(press, event.clientX, event.clientY, CLICK_DRAG_PX);
    }
  };
  const onUp = (): void => {
    // Keep `press` until the select.pointer update runs (same turn / microtask).
    queueMicrotask(() => {
      press = null;
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
        !update.selectionSet ||
        !update.transactions.some((tr) => tr.isUserEvent("select.pointer"))
      ) {
        return;
      }
      const head = update.state.selection.main.head;
      const domPos = domCaretPosition(view, {
        clientX: active.x,
        clientY: active.y,
      });
      const sameLine =
        domPos !== undefined &&
        update.state.doc.lineAt(domPos).number ===
          update.state.doc.lineAt(head).number;
      if (
        !shouldCorrectPointerClick({
          empty: update.state.selection.main.empty,
          dragged: active.dragged,
          domPos,
          selectionHead: head,
          sameLine,
        })
      ) {
        return;
      }
      const next = domPos!;
      // Defer: must not dispatch inside an update cycle.
      queueMicrotask(() => {
        if (!view.dom.isConnected) {
          return;
        }
        if (view.state.selection.main.head === next) {
          return;
        }
        // Only correct while the click selection is still empty at `head`.
        if (
          !view.state.selection.main.empty ||
          view.state.selection.main.head !== head
        ) {
          return;
        }
        view.dispatch({
          selection: EditorSelection.cursor(next),
          scrollIntoView: false,
        });
      });
    },
    destroy(): void {
      view.dom.removeEventListener("mousedown", onDown, true);
      doc.removeEventListener("mousemove", onMove, true);
      doc.removeEventListener("mouseup", onUp, true);
    },
  };
});
