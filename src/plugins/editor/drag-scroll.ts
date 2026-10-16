import { Prec } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import { EdgeScroll } from "../../webview/ui/edge-scroll";
import { editorSettings } from "./settings";

/**
 * Extra velocity in px/ms above CodeMirror's built-in selection scrolling.
 * Match its 6 px trigger zone and (8 + 0.7 * overshoot) px per 50 ms curve,
 * so a multiplier of 1 needs no extra motion and deeper drags still accelerate.
 */
export function additionalDragVelocity(
  position: number,
  from: number,
  to: number,
  speed: number,
): number {
  if (to <= from) {
    return 0;
  }
  if (position <= from + 6) {
    return (-(8 + 0.7 * Math.max(0, from - position)) / 50) * (speed - 1);
  }
  if (position >= to - 6) {
    return ((8 + 0.7 * Math.max(0, position - to)) / 50) * (speed - 1);
  }
  return 0;
}

/** Adds scroll motion while CodeMirror retains ownership of the mouse selection. */
export class SelectionDragScroll {
  private events?: AbortController;
  private scrolling?: EdgeScroll;

  constructor(private readonly view: EditorView) {}

  start(event: MouseEvent): void {
    this.stop();
    if (event.button !== 0) {
      return;
    }
    const { view } = this;
    this.events = new AbortController();
    // CodeMirror's own 50 ms scroll timer still extends the selection from
    // its last mouse event, even when the pointer stops moving. Supplement
    // scrolling only: replacing its selection logic loses word/line drags,
    // Shift/Mod selections and atomic-range handling.
    this.scrolling = new EdgeScroll(view.scrollDOM, view.contentDOM, () => {}, {
      velocity: (position, from, to) =>
        additionalDragVelocity(
          position,
          from,
          to,
          view.state.facet(editorSettings).dragScrollSpeed,
        ),
    });
    this.registerGestureEvents(this.events.signal);
  }

  private registerGestureEvents(signal: AbortSignal): void {
    const doc = this.view.dom.ownerDocument;
    doc.addEventListener(
      "mousemove",
      (event) => {
        // Match CodeMirror's cancellation on a released button; otherwise its
        // selection timer could end while our scroller keeps moving the note.
        if ((event.buttons & 1) === 0) {
          this.stop();
          return;
        }
        this.scrolling?.move({ x: event.clientX, y: event.clientY });
      },
      { signal },
    );
    const stop = (): void => this.stop();
    for (const target of [doc, doc.defaultView]) {
      for (const type of ["mouseup", "pointerup", "pointercancel"]) {
        target?.addEventListener(type, stop, { capture: true, signal });
      }
    }
    doc.defaultView?.addEventListener("blur", stop, { signal });
    // Moving selected text uses native drag-and-drop, not selection extension.
    doc.addEventListener("dragstart", stop, { capture: true, signal });
  }

  update(update: ViewUpdate): void {
    if (update.transactions.some((tr) => tr.isUserEvent("input.type"))) {
      this.stop();
    }
  }

  private stop(): void {
    this.events?.abort();
    delete this.events;
    this.scrolling?.destroy();
    delete this.scrolling;
  }

  destroy(): void {
    this.stop();
  }
}

const scrolling = ViewPlugin.fromClass(SelectionDragScroll);

export const selectionDragScroll = [
  scrolling,
  Prec.highest(
    EditorView.mouseSelectionStyle.of((view, event) => {
      view.plugin(scrolling)?.start(event);
      // Observe only gestures CodeMirror accepts, including custom styles;
      // returning null lets it choose the normal selection style.
      return null;
    }),
  ),
];
