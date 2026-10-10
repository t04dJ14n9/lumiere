import type { CellPosition } from "../../markdown/tables/model";
import type { Axis } from "../../markdown/tables/operations";
import { EdgeScroll, type PointerPoint } from "../../webview/ui/edge-scroll";
import { nearestEntry } from "./hit-test";

interface HandleActions {
  select(axis: Axis, index: number): void;
  move(axis: Axis, from: number, to: number): void;
  menu(axis: Axis, index: number, point: { x: number; y: number }): void;
}

interface Drag {
  axis: Axis;
  from: number;
  to: number;
  button: HTMLButtonElement;
  pointer: number;
  origin: PointerPoint;
  moved: boolean;
}

/** Cell-attached grips own pointer capture and feedback, never document changes. */
export class TableHandles {
  private readonly indicator = document.createElement("div");
  private readonly events = new AbortController();
  private active: CellPosition = { row: 0, column: 0 };
  private drag?: Drag;
  private readonly scrolling: EdgeScroll;

  constructor(
    private readonly root: HTMLElement,
    private readonly table: HTMLTableElement,
    viewport: HTMLElement,
    actions: HandleActions,
  ) {
    this.scrolling = new EdgeScroll(viewport, table, (point) =>
      this.updateTarget(point),
    );
    this.indicator.className = "table-drop-indicator";
    this.indicator.hidden = true;
    root.append(this.indicator);
    this.registerHandleEvents(actions);
    this.registerDragEvents(actions);
    this.refresh();
  }

  refresh(): void {
    Array.from(this.table.rows).forEach((row, index) => {
      const wrapper = row.cells[0]?.querySelector<HTMLElement>(
        ".table-cell-wrapper",
      );
      if (wrapper) {
        this.appendHandle(wrapper, "row", index);
      }
    });
    Array.from(this.table.rows[0]?.cells ?? []).forEach((cell, index) => {
      const wrapper = cell.querySelector<HTMLElement>(".table-cell-wrapper");
      if (wrapper) {
        this.appendHandle(wrapper, "column", index);
      }
    });
    this.setActive(this.active);
  }

  private appendHandle(wrapper: HTMLElement, axis: Axis, index: number): void {
    if (wrapper.querySelector(`[data-axis="${axis}"]`)) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `table-handle table-${axis}-handle`;
    button.dataset.axis = axis;
    button.dataset.index = String(index);
    button.title = `Drag to move ${axis}; press Enter for actions`;
    button.setAttribute("aria-label", `Move ${axis} ${index + 1}`);
    button.setAttribute("aria-haspopup", "menu");
    button.textContent = axis === "row" ? "⠿" : "⠶";
    wrapper.append(button);
  }

  private registerHandleEvents(actions: HandleActions): void {
    const options = { capture: true, signal: this.events.signal };
    this.root.addEventListener(
      "pointerdown",
      (event) => {
        const button = this.handle(event.target);
        if (button) {
          this.beginDrag(event, button, actions);
        }
      },
      options,
    );
    this.root.addEventListener(
      "lostpointercapture",
      (event) => {
        if (this.drag?.pointer === event.pointerId) {
          this.cancel();
        }
      },
      options,
    );
    this.root.addEventListener(
      "contextmenu",
      (event) => {
        const button = this.handle(event.target);
        if (button) {
          event.preventDefault();
          event.stopPropagation();
          this.openMenu(
            button,
            { x: event.clientX, y: event.clientY },
            actions,
          );
        }
      },
      options,
    );
    this.root.addEventListener(
      "keydown",
      (event) => {
        const button = this.handle(event.target);
        const isMenuKey =
          ["Enter", " ", "ContextMenu"].includes(event.key) ||
          (event.key === "F10" && event.shiftKey);
        if (button && isMenuKey) {
          event.preventDefault();
          event.stopPropagation();
          const bounds = button.getBoundingClientRect();
          this.openMenu(button, { x: bounds.left, y: bounds.bottom }, actions);
        }
      },
      options,
    );
  }

  private handle(target: EventTarget | null): HTMLButtonElement | undefined {
    if (!(target instanceof Element)) {
      return undefined;
    }
    const button = target.closest<HTMLButtonElement>(".table-handle");
    return button && this.table.contains(button) ? button : undefined;
  }

  private openMenu(
    button: HTMLButtonElement,
    point: PointerPoint,
    actions: HandleActions,
  ): void {
    button.focus();
    actions.menu(
      button.dataset.axis as Axis,
      Number(button.dataset.index),
      point,
    );
  }

  private beginDrag(
    event: PointerEvent,
    button: HTMLButtonElement,
    actions: HandleActions,
  ): void {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const axis = button.dataset.axis as Axis;
    const from = Number(button.dataset.index);
    actions.select(axis, from);
    this.drag = {
      axis,
      from,
      to: from,
      button,
      pointer: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    button.setPointerCapture(event.pointerId);
  }

  private registerDragEvents(actions: HandleActions): void {
    const options = { signal: this.events.signal };
    window.addEventListener(
      "pointermove",
      (event) => this.pointerMove(event),
      options,
    );
    window.addEventListener(
      "pointerup",
      (event) => this.finishDrag(event, actions),
      options,
    );
    window.addEventListener(
      "pointercancel",
      (event) => {
        if (this.drag?.pointer === event.pointerId) {
          this.cancel();
        }
      },
      options,
    );
    window.addEventListener("blur", () => this.cancel(), options);
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && this.drag) {
          event.preventDefault();
          event.stopPropagation();
          this.cancel();
        }
      },
      { ...options, capture: true },
    );
  }

  private pointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y) <
        4
    ) {
      return;
    }
    drag.moved = true;
    event.preventDefault();
    this.root.classList.add("table-dragging");
    const point = { x: event.clientX, y: event.clientY };
    this.updateTarget(point);
    this.scrolling.move(point);
  }

  private updateTarget(point: PointerPoint): void {
    const drag = this.drag;
    if (!drag?.moved) {
      return;
    }
    const entries =
      drag.axis === "column"
        ? Array.from(this.table.rows[0]!.cells)
        : Array.from(this.table.rows);
    const target = nearestEntry(entries, drag.axis, point);
    if (target < 0) {
      return;
    }
    drag.to = target;
    this.indicator.hidden = drag.to === drag.from;
    if (this.indicator.hidden) {
      return;
    }
    const bounds = entries[drag.to]!.getBoundingClientRect();
    const table = this.table.getBoundingClientRect();
    const origin = this.root.getBoundingClientRect();
    const before = drag.to < drag.from;
    const rtl = getComputedStyle(this.table).direction === "rtl";
    Object.assign(
      this.indicator.style,
      drag.axis === "column"
        ? {
            left: `${(before !== rtl ? bounds.left : bounds.right) - origin.left - 1}px`,
            top: `${table.top - origin.top}px`,
            width: "2px",
            height: `${table.height}px`,
          }
        : {
            left: `${table.left - origin.left}px`,
            top: `${(before ? bounds.top : bounds.bottom) - origin.top - 1}px`,
            width: `${table.width}px`,
            height: "2px",
          },
    );
  }

  private finishDrag(event: PointerEvent, actions: HandleActions): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    if (drag.moved) {
      this.updateTarget({ x: event.clientX, y: event.clientY });
    }
    this.cancel();
    if (drag.moved && drag.to !== drag.from) {
      actions.move(drag.axis, drag.from, drag.to);
    }
  }

  setActive(position: CellPosition): void {
    if (this.drag) {
      return;
    }
    this.active = { ...position };
    for (const button of this.table.querySelectorAll<HTMLElement>(
      ".table-handle",
    )) {
      const axis = button.dataset.axis as Axis;
      button.classList.toggle(
        "table-handle-active",
        Number(button.dataset.index) === position[axis],
      );
    }
  }

  cancel(): void {
    this.scrolling.stop();
    const drag = this.drag;
    delete this.drag;
    if (drag?.button.hasPointerCapture(drag.pointer)) {
      drag.button.releasePointerCapture(drag.pointer);
    }
    this.indicator.hidden = true;
    this.root.classList.remove("table-dragging");
  }

  destroy(): void {
    this.cancel();
    this.scrolling.destroy();
    this.events.abort();
  }
}
