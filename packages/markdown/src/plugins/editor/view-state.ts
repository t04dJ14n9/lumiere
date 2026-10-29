import { EditorView, ViewPlugin } from "@codemirror/view";
import type { SelectionRange, StateEffect } from "@codemirror/state";
import type { BaseContext, Infer } from "@workshop/core";
import type {} from "./api";
import { keepTextBelowStill } from "./keep-below-still";
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
  /** Where the pin last left the scroller, once applied. */
  scrollTop: number;
}
export function createViewState(ctx: BaseContext) {
  return new ViewState(ctx);
}
const SETTLE_MS = 1500;
/**
 * Input that means the reader is taking over, wherever it lands in the
 * scroller: the text, a gutter, a readable-width margin or the scrollbar.
 */
const READER_INPUT = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
/** Browsers round scroll positions to device pixels. */
const SCROLL_TOLERANCE = 1;

/** True when something other than the pin moved the scroller since it last wrote. */
function isScrolledByOthers(scrollTop: number, saved: PendingScroll): boolean {
  return (
    saved.applied && Math.abs(scrollTop - saved.scrollTop) > SCROLL_TOLERANCE
  );
}

class ViewState {
  private readonly pendingScroll = new WeakMap<EditorView, PendingScroll>();
  /** Per view, stops listening for the reader once its pin ends. */
  private readonly readerListeners = new WeakMap<EditorView, AbortController>();
  readonly restoreScrollPosition;

  constructor(ctx: BaseContext) {
    // Widgets that scroll the note themselves (table wheel forwarding) say so.
    ctx.on("editor/scrollInput", (view) => this.unpin(view));
    this.restoreScrollPosition = this.scrollExtensions();
  }

  private pin(view: EditorView, pending: PendingScroll): void {
    this.pendingScroll.set(view, pending);
    if (!this.readerListeners.has(view)) {
      this.readerListeners.set(view, this.listenForReader(view));
    }
  }

  private unpin(view: EditorView): void {
    this.pendingScroll.delete(view);
    this.readerListeners.get(view)?.abort();
    this.readerListeners.delete(view);
  }

  /**
   * Any scroll the pin did not make is the reader's (a wheel over a margin,
   * a scrollbar drag, PageDown outside the text), so it ends the pin. The
   * listeners sit on the scroller, not CodeMirror's content element, so
   * margins and gutters count, and only while a pin is held. Capture runs
   * them before CodeMirror's own scroll listener, which measures at once and
   * would correct the pin first. All are passive: a wheel or touch listener
   * that is not makes every gesture wait for the main thread.
   */
  private listenForReader(view: EditorView): AbortController {
    const listening = new AbortController();
    const options = { capture: true, passive: true, signal: listening.signal };
    const scroller = view.scrollDOM;
    scroller.addEventListener(
      "scroll",
      () => {
        const saved = this.pendingScroll.get(view);
        if (saved && isScrolledByOthers(scroller.scrollTop, saved)) {
          this.unpin(view);
        }
      },
      options,
    );
    for (const type of READER_INPUT) {
      scroller.addEventListener(type, () => this.unpin(view), options);
    }
    return listening;
  }

  private anchorOffset(view: EditorView, from: number): number {
    const block = view.lineBlockAt(from);
    const top = view.scrollDOM.getBoundingClientRect().top;
    return block.top + (view.documentTop - top) / view.scaleY;
  }

  /**
   * Re-pin the restored line after CodeMirror's next measurement, once
   * CodeMirror has held its own anchor. Its anchor is usually the restored
   * line, so it already undoes content growing above it; correcting in the
   * measurement as well scrolled twice, and the line ended a whole image
   * too high. A microtask queued there runs after CodeMirror's measuring
   * and before the frame is painted, so only what is left is corrected.
   */
  private correctPinnedScroll(view: EditorView, saved: PendingScroll): void {
    view.requestMeasure({
      key: this.pendingScroll,
      // CodeMirror may measure before the reader's scroll event arrives,
      // from its listener on an ancestor scroller.
      read: (current) =>
        this.pendingScroll.get(current) === saved &&
        isScrolledByOthers(current.scrollDOM.scrollTop, saved),
      write: (isScrolledAway, current) => {
        if (isScrolledAway) {
          this.unpin(current);
        } else {
          queueMicrotask(() => this.settlePin(current, saved));
        }
      },
    });
  }

  /** Put the restored line back where it was saved, if it is not there. */
  private settlePin(view: EditorView, saved: PendingScroll): void {
    if (this.pendingScroll.get(view) !== saved) {
      return;
    }
    const difference = this.anchorOffset(view, saved.from) - saved.offset;
    if (Math.abs(difference) > 0.5) {
      this.scrollPinned(view, saved, difference);
    } else {
      // CodeMirror's own anchoring may have scrolled: that was not the reader.
      saved.scrollTop = view.scrollDOM.scrollTop;
    }
  }

  /** Scroll by `difference`, remembering where the browser actually put it. */
  private scrollPinned(
    view: EditorView,
    saved: PendingScroll,
    difference: number,
  ): void {
    view.scrollDOM.scrollTop += difference;
    saved.scrollTop = view.scrollDOM.scrollTop;
  }

  private scrollExtensions() {
    return [
      EditorView.scrollHandler.of((view, range) => this.applyPin(view, range)),
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
            this.unpin(view);
          } else {
            this.correctPinnedScroll(view, saved);
          }
        },
        destroy: () => this.unpin(view),
      })),
      keepTextBelowStill((view) => this.pendingScroll.has(view)),
    ];
  }

  /** Place the pinned line where CodeMirror would scroll to it. */
  private applyPin(view: EditorView, range: SelectionRange): boolean {
    const saved = this.pendingScroll.get(view);
    if (!saved) {
      return false;
    }
    if (saved.applied || range.head !== saved.from) {
      this.unpin(view);
      return false;
    }
    saved.applied = true;
    saved.settleUntil = Date.now() + SETTLE_MS;
    // Runs in CodeMirror's measured scrolling phase, including when one wrapped
    // line is taller than the viewport. Ordinary navigation margins are clamped.
    this.scrollPinned(
      view,
      saved,
      this.anchorOffset(view, saved.from) - saved.offset,
    );
    view.scrollDOM.scrollLeft = saved.left;
    this.correctPinnedScroll(view, saved);
    return true;
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
    this.pin(view, {
      ...top,
      left,
      applied: false,
      settleUntil: 0,
      scrollTop: 0,
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
      this.pin(view, {
        from,
        offset: saved.scrollAnchor.offset,
        left: saved.scrollLeft ?? 0,
        applied: false,
        settleUntil: 0,
        scrollTop: 0,
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
