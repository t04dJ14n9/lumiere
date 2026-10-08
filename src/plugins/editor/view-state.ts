import { EditorView, ViewPlugin } from "@codemirror/view";
import type { StateEffect } from "@codemirror/state";
import type { Infer } from "../../kernel";
import type { viewState } from "./protocol";
type EditorViewState = Infer<typeof viewState>;

/**
 * A reading position being restored: keep line `from` at `offset` pixels from
 * the top of the viewport. Content above it can still change height after
 * the first scroll (fonts, a wrapping title, images, math), so the position
 * stays pinned while layout settles, until the reader scrolls or types.
 */
interface PendingScroll {
  from: number;
  offset: number;
  left: number;
  applied: boolean;
  settleUntil: number;
}
export function createViewState() {
  const pendingScroll = new WeakMap<EditorView, PendingScroll>();
  const SETTLE_MS = 1500;

  function anchorOffset(view: EditorView, from: number): number {
    const block = view.lineBlockAt(from);
    const top = view.scrollDOM.getBoundingClientRect().top;
    return block.top + (view.documentTop - top) / view.scaleY;
  }

  /** Re-pin the restored line after CodeMirror's next measurement. */
  function correctPinnedScroll(view: EditorView, saved: PendingScroll): void {
    view.requestMeasure({
      key: pendingScroll,
      read: (current) =>
        pendingScroll.get(current) === saved
          ? anchorOffset(current, saved.from) - saved.offset
          : undefined,
      write: (difference, current) => {
        if (difference !== undefined && Math.abs(difference) > 0.5) {
          current.scrollDOM.scrollTop += difference;
        }
      },
    });
  }

  const cancelScrollRestore = (_event: Event, view: EditorView): void => {
    pendingScroll.delete(view);
  };

  const restoreScrollPosition = [
    EditorView.scrollHandler.of((view, range) => {
      const saved = pendingScroll.get(view);
      if (!saved) {
        return false;
      }
      if (saved.applied || range.head !== saved.from) {
        pendingScroll.delete(view);
        return false;
      }
      saved.applied = true;
      saved.settleUntil = Date.now() + SETTLE_MS;
      // Runs in CodeMirror's measured scrolling phase, including when one wrapped
      // line is taller than the viewport. Ordinary navigation margins are clamped.
      view.scrollDOM.scrollTop += anchorOffset(view, saved.from) - saved.offset;
      view.scrollDOM.scrollLeft = saved.left;
      correctPinnedScroll(view, saved);
      return true;
    }),
    ViewPlugin.define((view) => ({
      update(update) {
        const saved = pendingScroll.get(view);
        if (
          !saved?.applied ||
          !(update.geometryChanged || update.heightChanged)
        ) {
          return;
        }
        if (Date.now() > saved.settleUntil) {
          pendingScroll.delete(view);
        } else {
          correctPinnedScroll(view, saved);
        }
      },
    })),
    EditorView.domEventHandlers({
      wheel: cancelScrollRestore,
      pointerdown: cancelScrollRestore,
      keydown: cancelScrollRestore,
      touchstart: cancelScrollRestore,
    }),
  ];

  /** Measure only when transferring a pane, never on its ordinary typing path. */
  function captureViewState(
    view: EditorView,
    state: EditorViewState,
  ): EditorViewState {
    const viewport = view.scrollDOM.getBoundingClientRect();
    const block = view.lineBlockAtHeight(
      (viewport.top - view.documentTop) / view.scaleY,
    );
    return {
      ...state,
      scrollLeft: view.scrollDOM.scrollLeft,
      scrollAnchor: {
        from: block.from,
        offset: block.top + (view.documentTop - viewport.top) / view.scaleY,
      },
    };
  }

  /** Restore presentation without the unfolding and centering of source navigation. */
  function restoreViewState(view: EditorView, saved: EditorViewState): void {
    const length = view.state.doc.length;
    const effects: StateEffect<unknown>[] = [];
    if (saved.scrollAnchor) {
      const from = Math.min(saved.scrollAnchor.from, length);
      pendingScroll.set(view, {
        from,
        offset: saved.scrollAnchor.offset,
        left: saved.scrollLeft ?? 0,
        applied: false,
        settleUntil: 0,
      });
      effects.push(EditorView.scrollIntoView(from, { y: "start" }));
    }
    view.dispatch({
      selection: {
        anchor: Math.min(saved.anchor, length),
        head: Math.min(saved.head, length),
      },
      effects,
    });
    if (!saved.scrollAnchor) {
      view.scrollDOM.scrollTop = saved.scrollTop;
      view.scrollDOM.scrollLeft = saved.scrollLeft ?? 0;
    }
  }

  return { restoreScrollPosition, captureViewState, restoreViewState };
}
