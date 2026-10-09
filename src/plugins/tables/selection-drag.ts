import type { CellPosition } from "../../markdown/tables/model";
import { EdgeScroll, type PointerPoint } from "../../webview/ui/edge-scroll";
import { cellAtPoint } from "./hit-test";

interface Gesture {
  pointer: number;
  origin: CellPosition;
  offset?: number;
  nativeText: boolean;
  selected: boolean;
  head: CellPosition;
  point: PointerPoint;
}

interface SelectionActions {
  select(anchor: CellPosition, head: CellPosition): void;
  finish(
    origin: CellPosition,
    offset: number | undefined,
    selected: boolean,
  ): void;
}

/** Pointer lifecycle for rectangular selection, separate from cell editing. */
export class TableSelectionDrag {
  private gesture?: Gesture;
  private readonly scrolling: EdgeScroll;
  private readonly events = new AbortController();

  constructor(
    private readonly root: HTMLElement,
    private readonly table: HTMLTableElement,
    viewport: HTMLElement,
    private readonly actions: SelectionActions,
  ) {
    this.scrolling = new EdgeScroll(viewport, table, (point) =>
      this.update(point),
    );
    this.registerEvents();
  }

  private registerEvents(): void {
    this.registerPointerMove();
    window.addEventListener(
      "pointerup",
      (event) => {
        const gesture = this.gesture;
        if (!gesture || gesture.pointer !== event.pointerId) {
          return;
        }
        this.update({ x: event.clientX, y: event.clientY }, false);
        this.cancel();
        this.actions.finish(gesture.origin, gesture.offset, gesture.selected);
      },
      { signal: this.events.signal },
    );
    window.addEventListener(
      "pointercancel",
      (event) => {
        if (this.gesture?.pointer === event.pointerId) {
          this.cancel();
        }
      },
      { signal: this.events.signal },
    );
    window.addEventListener("blur", () => this.cancel(), {
      signal: this.events.signal,
    });
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && this.gesture) {
          event.preventDefault();
          event.stopPropagation();
          this.cancel();
        }
      },
      { capture: true, signal: this.events.signal },
    );
    this.root.addEventListener(
      "lostpointercapture",
      (event) => {
        if (this.gesture?.pointer === event.pointerId) {
          this.cancel();
        }
      },
      { signal: this.events.signal },
    );
  }

  private registerPointerMove(): void {
    window.addEventListener(
      "pointermove",
      (event) => {
        const gesture = this.gesture;
        if (!gesture || gesture.pointer !== event.pointerId || !event.buttons) {
          return;
        }
        gesture.point = { x: event.clientX, y: event.clientY };
        this.update(gesture.point);
        if (gesture.selected) {
          event.preventDefault();
        }
        if (gesture.selected || !gesture.nativeText) {
          this.scrolling.move(gesture.point);
        }
      },
      { signal: this.events.signal },
    );
  }

  begin(
    event: PointerEvent,
    origin: CellPosition,
    offset: number | undefined,
    nativeText: boolean,
  ): void {
    this.cancel();
    this.gesture = {
      pointer: event.pointerId,
      origin,
      ...(offset === undefined ? {} : { offset }),
      nativeText,
      selected: false,
      head: origin,
      point: { x: event.clientX, y: event.clientY },
    };
    if (!nativeText) {
      this.root.setPointerCapture(event.pointerId);
    }
  }

  private update(point: PointerPoint, capture = true): void {
    const gesture = this.gesture;
    if (!gesture) {
      return;
    }
    const head = cellAtPoint(this.table, point);
    if (
      !head ||
      (head.row === gesture.head.row && head.column === gesture.head.column)
    ) {
      return;
    }
    if (!gesture.selected) {
      gesture.selected = true;
      if (capture) {
        this.root.setPointerCapture(gesture.pointer);
      }
    }
    gesture.head = head;
    this.actions.select(gesture.origin, head);
  }

  cancel(): void {
    const gesture = this.gesture;
    delete this.gesture;
    this.scrolling.stop();
    if (gesture && this.root.hasPointerCapture(gesture.pointer)) {
      this.root.releasePointerCapture(gesture.pointer);
    }
  }

  destroy(): void {
    this.cancel();
    this.scrolling.destroy();
    this.events.abort();
  }
}
