import type { CellPosition } from "../../markdown/tables/model";
import {
  EdgeScroll,
  type DragViewports,
  type PointerPoint,
} from "../../webview/ui/edge-scroll";
import { cellAtPoint, cellUnderPoint } from "./hit-test";

export interface GestureFinish {
  origin: CellPosition;
  offset?: number;
  selected: boolean;
  nativeText: boolean;
  detail: number;
  startPoint: PointerPoint;
  endPoint: PointerPoint;
}

interface Gesture {
  pointer: number;
  origin: CellPosition;
  offset?: number;
  nativeText: boolean;
  selected: boolean;
  head: CellPosition;
  detail: number;
  startPoint: PointerPoint;
  point: PointerPoint;
}

interface SelectionActions {
  select(anchor: CellPosition, head: CellPosition): void;
  finish(gesture: GestureFinish): void;
}

/** Pointer lifecycle for rectangular selection, separate from cell editing. */
export class TableSelectionDrag {
  private gesture?: Gesture;
  private readonly scrolling: EdgeScroll;
  private readonly events = new AbortController();

  constructor(
    private readonly root: HTMLElement,
    private readonly table: HTMLTableElement,
    viewports: DragViewports,
    private readonly actions: SelectionActions,
  ) {
    this.scrolling = new EdgeScroll(
      viewports.vertical,
      table,
      (point) => this.update(point),
      { horizontal: viewports.horizontal },
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
        const endPoint = { x: event.clientX, y: event.clientY };
        this.update(endPoint, false);
        this.cancel();
        this.actions.finish({
          origin: gesture.origin,
          ...(gesture.offset === undefined ? {} : { offset: gesture.offset }),
          selected: gesture.selected,
          nativeText: gesture.nativeText,
          detail: gesture.detail,
          startPoint: gesture.startPoint,
          endPoint,
        });
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
    const startPoint = { x: event.clientX, y: event.clientY };
    this.gesture = {
      pointer: event.pointerId,
      origin,
      ...(offset === undefined ? {} : { offset }),
      nativeText,
      selected: false,
      head: origin,
      detail: event.detail || 1,
      startPoint,
      point: startPoint,
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
    // Native cell-text drags must not clamp to the nearest cell once the
    // pointer leaves the table — that turned paragraph selections near a
    // table into whole-column grid selections. Strict hit-testing applies
    // only until grid selection starts; afterwards nearest-cell clamping
    // still supports edge-scroll multi-cell selection.
    const head =
      gesture.nativeText && !gesture.selected
        ? cellUnderPoint(this.table, point)
        : cellAtPoint(this.table, point);
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
