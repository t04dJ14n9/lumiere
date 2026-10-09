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
  pointer: number;
  x: number;
  y: number;
  moved: boolean;
  point: PointerPoint;
  grab: number;
}

/** Row/column grips own pointer capture and feedback, never document changes. */
export class TableHandles {
  private readonly row = document.createElement("button");
  private readonly column = document.createElement("button");
  private readonly indicator = document.createElement("div");
  private readonly events = new AbortController();
  private readonly resize: ResizeObserver;
  private active: CellPosition = { row: 0, column: 0 };
  private drag?: Drag;
  private frame?: number;
  private readonly scrolling: EdgeScroll;

  constructor(
    private readonly root: HTMLElement,
    private readonly table: HTMLTableElement,
    viewport: HTMLElement,
    actions: HandleActions,
  ) {
    this.scrolling = new EdgeScroll(viewport, table, (point) => {
      this.updateTarget(point);
      this.refresh();
    });
    this.registerHandle("row", this.row, actions);
    this.registerHandle("column", this.column, actions);
    this.indicator.className = "table-drop-indicator";
    this.indicator.hidden = true;
    root.append(this.indicator);
    this.registerHover();
    this.registerDragEvents(actions);
    this.resize = new ResizeObserver(() => this.refresh());
    this.resize.observe(table);
  }

  private registerHandle(
    axis: Axis,
    button: HTMLButtonElement,
    actions: HandleActions,
  ): void {
    button.type = "button";
    button.className = `table-handle table-${axis}-handle`;
    button.title = `Drag to move ${axis}; press Enter for actions`;
    button.textContent = axis === "row" ? "⠿" : "⠶";
    button.addEventListener("pointerdown", (event) =>
      this.beginDrag(event, { axis, button, actions }),
    );
    button.addEventListener("lostpointercapture", (event) => {
      if (this.drag?.pointer === event.pointerId) {
        this.cancel();
      }
    });
    const menu = (point: { x: number; y: number }): void => {
      button.focus();
      actions.menu(axis, this.active[axis], point);
    };
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu({ x: event.clientX, y: event.clientY });
    });
    button.addEventListener("keydown", (event) => {
      if (
        ["Enter", " ", "ContextMenu"].includes(event.key) ||
        (event.key === "F10" && event.shiftKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        const bounds = button.getBoundingClientRect();
        menu({ x: bounds.left, y: bounds.bottom });
      }
    });
    this.root.append(button);
  }
  private beginDrag(
    event: PointerEvent,
    options: { axis: Axis; button: HTMLButtonElement; actions: HandleActions },
  ): void {
    const { axis, button, actions } = options;
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const from = this.active[axis];
    const bounds = button.getBoundingClientRect();
    actions.select(axis, from);
    this.refresh();
    this.drag = {
      axis,
      from,
      to: from,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      point: { x: event.clientX, y: event.clientY },
      grab:
        axis === "row"
          ? event.clientY - bounds.top
          : event.clientX - bounds.left,
    };
    button.setPointerCapture(event.pointerId);
  }
  private registerHover(): void {
    this.root.addEventListener("pointermove", (event) => {
      if (this.drag || !(event.target instanceof Element)) {
        return;
      }
      const cell = event.target.closest<HTMLElement>(
        "td[data-row], th[data-row]",
      );
      if (cell && this.table.contains(cell)) {
        this.setActive({
          row: Number(cell.dataset.row),
          column: Number(cell.dataset.column),
        });
      }
    });
  }
  private registerDragEvents(actions: HandleActions): void {
    window.addEventListener("pointermove", (event) => this.pointerMove(event), {
      signal: this.events.signal,
    });
    window.addEventListener(
      "pointerup",
      (event) => this.finishDrag(event, actions),
      { signal: this.events.signal },
    );
    window.addEventListener(
      "pointercancel",
      (event) => {
        if (this.drag?.pointer === event.pointerId) {
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
        if (event.key === "Escape" && this.drag) {
          event.preventDefault();
          event.stopPropagation();
          this.cancel();
        }
      },
      { capture: true, signal: this.events.signal },
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
      this.setActive({ ...this.active, [drag.axis]: drag.to });
    }
  }

  setActive(position: CellPosition): void {
    if (!this.drag) {
      this.active = { ...position };
      this.refresh();
    }
  }

  refresh(): void {
    if (this.frame !== undefined) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      delete this.frame;
      if (this.root.isConnected) {
        this.measure();
      }
    });
  }

  private measure(): void {
    const rows = this.table.rows;
    this.active.row = Math.min(this.active.row, rows.length - 1);
    this.active.column = Math.min(
      this.active.column,
      (rows[0]?.cells.length ?? 0) - 1,
    );
    const first = rows[this.active.row]?.cells[0];
    const header = rows[0]?.cells[this.active.column];
    if (!first || !header) {
      this.row.hidden = this.column.hidden = true;
      return;
    }
    this.row.hidden = this.column.hidden = false;
    const origin = this.root.getBoundingClientRect();
    const row = first.getBoundingClientRect();
    const column = header.getBoundingClientRect();
    Object.assign(this.row.style, {
      left: `${row.left - origin.left - 15}px`,
      top: `${row.top - origin.top}px`,
      height: `${row.height}px`,
    });
    Object.assign(this.column.style, {
      left: `${column.left - origin.left}px`,
      top: `${column.top - origin.top - 15}px`,
      width: `${column.width}px`,
    });
    const drag = this.drag;
    if (drag?.moved) {
      const bounds = this.table.getBoundingClientRect();
      const button = drag.axis === "row" ? this.row : this.column;
      const horizontal = drag.axis === "column";
      const min = horizontal ? bounds.left : bounds.top;
      const max = horizontal
        ? bounds.right - column.width
        : bounds.bottom - row.height;
      const position = Math.max(
        min,
        Math.min(max, (horizontal ? drag.point.x : drag.point.y) - drag.grab),
      );
      button.style[horizontal ? "left" : "top"] =
        `${position - (horizontal ? origin.left : origin.top)}px`;
    }
    this.row.setAttribute("aria-label", `Move row ${this.active.row + 1}`);
    this.column.setAttribute(
      "aria-label",
      `Move column ${this.active.column + 1}`,
    );
  }

  private pointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4
    ) {
      return;
    }
    drag.moved = true;
    event.preventDefault();
    this.root.classList.add("table-dragging");
    drag.point = { x: event.clientX, y: event.clientY };
    this.scrolling.move(drag.point);
  }

  private updateTarget(point: PointerPoint): void {
    const drag = this.drag;
    if (!drag?.moved) {
      return;
    }
    drag.point = point;
    const horizontal = drag.axis === "column";
    const entries = horizontal
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
      horizontal
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

  cancel(): void {
    this.scrolling.stop();
    const drag = this.drag;
    delete this.drag;
    if (drag) {
      const button = drag.axis === "row" ? this.row : this.column;
      if (button.hasPointerCapture(drag.pointer)) {
        button.releasePointerCapture(drag.pointer);
      }
    }
    this.indicator.hidden = true;
    this.root.classList.remove("table-dragging");
    this.refresh();
  }

  destroy(): void {
    this.cancel();
    this.scrolling.destroy();
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
    }
    this.events.abort();
    this.resize.disconnect();
  }
}
