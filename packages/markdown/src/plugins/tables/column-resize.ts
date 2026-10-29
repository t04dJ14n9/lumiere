import {
  applyColumnWidth,
  MIN_COLUMN_WIDTH,
  type ColumnWidth,
} from "./column-widths";

interface ResizeDrag {
  column: number;
  pointer: number;
  startX: number;
  startWidth: number;
  handle: HTMLElement;
}

/** Drag the right edge of a column to set its width; does not use move grips. */
export class ColumnResize {
  private readonly events = new AbortController();
  private drag?: ResizeDrag;

  constructor(
    private readonly root: HTMLElement,
    private readonly table: HTMLTableElement,
    private readonly persist: (
      widths: number[],
      column: number,
      width: number,
    ) => void,
  ) {
    this.register();
    this.refresh();
  }

  refresh(): void {
    const header = this.table.rows[0];
    if (!header) {
      return;
    }
    Array.from(header.cells).forEach((cell, index) => {
      const wrapper = cell.querySelector<HTMLElement>(".table-cell-wrapper");
      if (!wrapper || wrapper.querySelector(".table-col-resizer")) {
        return;
      }
      const handle = document.createElement("div");
      handle.className = "table-col-resizer";
      handle.dataset.column = String(index);
      handle.title = "Drag to resize column";
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      handle.setAttribute("aria-label", `Resize column ${index + 1}`);
      wrapper.append(handle);
    });
  }

  /** Paint `<colgroup>` from persisted widths; omit cols that are still auto. */
  applyWidths(widths: ColumnWidth[] | undefined): void {
    this.table.querySelector("colgroup")?.remove();
    if (!widths?.some((width) => width !== undefined)) {
      this.table.style.tableLayout = "";
      return;
    }
    this.table.style.tableLayout = "fixed";
    const group = document.createElement("colgroup");
    const count = Math.max(
      widths.length,
      this.table.rows[0]?.cells.length ?? 0,
    );
    for (let index = 0; index < count; index++) {
      const col = document.createElement("col");
      const width = widths[index];
      if (width !== undefined) {
        col.style.width = `${width}px`;
      }
      group.append(col);
    }
    this.table.prepend(group);
  }

  destroy(): void {
    this.cancel();
    this.events.abort();
  }

  private register(): void {
    const options = { capture: true, signal: this.events.signal };
    this.root.addEventListener(
      "pointerdown",
      (event) => {
        const handle = this.handle(event.target);
        if (handle) {
          this.begin(event, handle);
        }
      },
      options,
    );
    window.addEventListener("pointermove", (event) => this.move(event), {
      signal: this.events.signal,
    });
    window.addEventListener("pointerup", (event) => this.finish(event), {
      signal: this.events.signal,
    });
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
  }

  private handle(target: EventTarget | null): HTMLElement | undefined {
    if (!(target instanceof Element)) {
      return undefined;
    }
    const node = target.closest<HTMLElement>(".table-col-resizer");
    return node && this.table.contains(node) ? node : undefined;
  }

  private begin(event: PointerEvent, handle: HTMLElement): void {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const column = Number(handle.dataset.column);
    const cell = this.table.rows[0]?.cells[column];
    if (!cell) {
      return;
    }
    this.drag = {
      column,
      pointer: event.pointerId,
      startX: event.clientX,
      startWidth: cell.getBoundingClientRect().width,
      handle,
    };
    handle.setPointerCapture(event.pointerId);
    this.root.classList.add("table-col-resizing");
  }

  private move(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    event.preventDefault();
    const width = Math.max(
      MIN_COLUMN_WIDTH,
      Math.round(drag.startWidth + event.clientX - drag.startX),
    );
    const col =
      this.table.querySelectorAll("col")[drag.column] ??
      this.ensureLiveCol(drag.column);
    col.style.width = `${width}px`;
    this.table.style.tableLayout = "fixed";
  }

  private ensureLiveCol(column: number): HTMLElement {
    let group = this.table.querySelector("colgroup");
    if (!group) {
      group = document.createElement("colgroup");
      const count = this.table.rows[0]?.cells.length ?? column + 1;
      for (let index = 0; index < count; index++) {
        group.append(document.createElement("col"));
      }
      this.table.prepend(group);
    }
    while (group.children.length <= column) {
      group.append(document.createElement("col"));
    }
    return group.children[column] as HTMLElement;
  }

  private finish(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    const width = Math.max(
      MIN_COLUMN_WIDTH,
      Math.round(drag.startWidth + event.clientX - drag.startX),
    );
    const measured = this.measureColumns();
    const seeded = applyColumnWidth(measured, drag.column, width);
    this.cancel();
    this.persist(seeded, drag.column, width);
  }

  private measureColumns(): number[] {
    const header = this.table.rows[0];
    if (!header) {
      return [];
    }
    return Array.from(header.cells).map((cell) =>
      Math.max(
        MIN_COLUMN_WIDTH,
        Math.round(cell.getBoundingClientRect().width),
      ),
    );
  }

  private cancel(): void {
    const drag = this.drag;
    delete this.drag;
    this.root.classList.remove("table-col-resizing");
    if (drag?.handle.hasPointerCapture(drag.pointer)) {
      drag.handle.releasePointerCapture(drag.pointer);
    }
  }
}
