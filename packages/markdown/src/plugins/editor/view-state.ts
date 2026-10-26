import { EditorView, ViewPlugin } from "@codemirror/view";
import type { StateEffect } from "@codemirror/state";
import type { BaseContext, Infer } from "@workshop/core";
import type {} from "./api";
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
export function createViewState(ctx: BaseContext) {
  return new ViewState(ctx);
}
const SETTLE_MS = 1500;
class ViewState {
  private readonly pendingScroll = new WeakMap<EditorView, PendingScroll>();
  readonly restoreScrollPosition;

  constructor(ctx: BaseContext) {
    // Ignored widgets bypass CodeMirror's DOM handlers, even for real input.
    ctx.on("editor/scrollInput", (view) => this.pendingScroll.delete(view));
    this.restoreScrollPosition = this.scrollExtensions();
  }

  private anchorOffset(view: EditorView, from: number): number {
    const block = view.lineBlockAt(from);
    const top = view.scrollDOM.getBoundingClientRect().top;
    return block.top + (view.documentTop - top) / view.scaleY;
  }

  /** Re-pin the restored line after CodeMirror's next measurement. */
  private correctPinnedScroll(view: EditorView, saved: PendingScroll): void {
    view.requestMeasure({
      key: this.pendingScroll,
      read: (current) =>
        this.pendingScroll.get(current) === saved
          ? this.anchorOffset(current, saved.from) - saved.offset
          : undefined,
      write: (difference, current) => {
        if (difference !== undefined && Math.abs(difference) > 0.5) {
          current.scrollDOM.scrollTop += difference;
        }
      },
    });
  }

  private scrollExtensions() {
    const cancelScrollRestore = (_event: Event, view: EditorView): void => {
      this.pendingScroll.delete(view);
    };

    return [
      EditorView.scrollHandler.of((view, range) => {
        const saved = this.pendingScroll.get(view);
        if (!saved) {
          return false;
        }
        if (saved.applied || range.head !== saved.from) {
          this.pendingScroll.delete(view);
          return false;
        }
        saved.applied = true;
        saved.settleUntil = Date.now() + SETTLE_MS;
        // Runs in CodeMirror's measured scrolling phase, including when one wrapped
        // line is taller than the viewport. Ordinary navigation margins are clamped.
        view.scrollDOM.scrollTop +=
          this.anchorOffset(view, saved.from) - saved.offset;
        view.scrollDOM.scrollLeft = saved.left;
        this.correctPinnedScroll(view, saved);
        return true;
      }),
      ViewPlugin.define((view) => ({
        update: (update) => {
          const saved = this.pendingScroll.get(view);
          if (
            !saved?.applied ||
            !(update.geometryChanged || update.heightChanged)
          ) {
            return;
          }
          if (Date.now() > saved.settleUntil) {
            this.pendingScroll.delete(view);
          } else {
            this.correctPinnedScroll(view, saved);
          }
        },
      })),
      // Observers, not handlers: CodeMirror listens passively when no
      // handler wants an event type, so a wheel or touch scroll starts on
      // the compositor instead of waiting for the main thread each time.
      EditorView.domEventObservers({
        wheel: cancelScrollRestore,
        touchstart: cancelScrollRestore,
      }),
      EditorView.domEventHandlers({
        pointerdown: cancelScrollRestore,
        keydown: cancelScrollRestore,
      }),
    ];
  }
  /** The line at the top of the viewport, and how far above the top it starts. */
  private topLine(view: EditorView): { from: number; offset: number } {
    const viewport = view.scrollDOM.getBoundingClientRect();
    const block = view.lineBlockAtHeight(
      (viewport.top - view.documentTop) / view.scaleY,
    );
    return {
      from: block.from,
      offset: block.top + (view.documentTop - viewport.top) / view.scaleY,
    };
  }

  /** Measure only when transferring a pane, never on its ordinary typing path. */
  captureViewState(view: EditorView, state: EditorViewState): EditorViewState {
    return {
      ...state,
      scrollLeft: view.scrollDOM.scrollLeft,
      scrollAnchor: this.topLine(view),
    };
  }

  /**
   * Run `change` (turning a plugin on or off) keeping the reader's place:
   * reconfiguring re-estimates the heights above the viewport, so the line
   * at the top stays pinned while layout settles, as a restored view does.
   */
  keepPlace(view: EditorView, change: () => void): void {
    const pinned = this.pendingScroll.get(view);
    // A restore on its way places the view itself; at the top, nothing moves.
    if (pinned ? !pinned.applied : view.scrollDOM.scrollTop === 0) {
      change();
      return;
    }
    // Still settling from the last change: keep the same line pinned.
    const top = pinned
      ? { from: pinned.from, offset: pinned.offset }
      : this.topLine(view);
    const left = view.scrollDOM.scrollLeft;
    change();
    this.pendingScroll.set(view, {
      ...top,
      left,
      applied: false,
      settleUntil: 0,
    });
    view.dispatch({
      effects: EditorView.scrollIntoView(top.from, { y: "start" }),
    });
  }

  /** Restore presentation without the unfolding and centering of source navigation. */
  restoreViewState(view: EditorView, saved: EditorViewState): void {
    const length = view.state.doc.length;
    const effects: StateEffect<unknown>[] = [];
    if (saved.scrollAnchor) {
      const from = Math.min(saved.scrollAnchor.from, length);
      this.pendingScroll.set(view, {
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
}
