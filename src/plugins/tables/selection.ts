import { rectangle, type CellPosition } from "../../markdown/tables/model";
import { type Axis } from "../../markdown/tables/operations";

import { activeTables, tableSelectionChanges } from "./state";

import type { TableController } from "./controller";
export function selection(
  this: TableController,
): { from: number; to: number } | undefined {
  const start = this.start();
  if (this.range) {
    const area = rectangle(this.range);
    return {
      from: start + this.model.rows[area.top]![area.left]!.from,
      to: start + this.model.rows[area.bottom]![area.right]!.to,
    };
  }
  if (!this.active || !this.inner) {
    return undefined;
  }
  const cell = this.model.rows[this.active.row]?.[this.active.column];
  if (!cell) {
    return undefined;
  }
  const range = this.cellEditor!.source.range(this.block.source, cell);
  return {
    from: start + range.from + this.inner.state.selection.main.from,
    to: start + range.from + this.inner.state.selection.main.to,
  };
}

export function selectAxis(
  this: TableController,
  axis: Axis,
  index: number,
  focus = true,
): void {
  this.close();
  this.range =
    axis === "row"
      ? {
          anchor: { row: index, column: 0 },
          head: { row: index, column: this.model.alignments.length - 1 },
        }
      : {
          anchor: { row: 0, column: index },
          head: { row: this.model.rows.length - 1, column: index },
        };
  this.gridCursor = undefined;
  activeTables.set(this.outer, this);
  this.handles.setActive(this.range.anchor);
  this.highlight();
  if (focus) {
    this.root.focus({ preventScroll: true });
  }
}

export function position(
  this: TableController,
  target: EventTarget | null,
): CellPosition | undefined {
  const cell =
    target instanceof Element
      ? target.closest<HTMLElement>("td[data-row], th[data-row]")
      : null;
  if (!cell || !this.table.contains(cell)) {
    return undefined;
  }
  return {
    row: Number(cell.dataset.row),
    column: Number(cell.dataset.column),
  };
}

export function pointerDown(this: TableController, event: PointerEvent): void {
  const insideCellEditor =
    event.target instanceof Node && this.inner?.dom.contains(event.target);
  if (
    event.target instanceof Element &&
    event.target.closest("button, a, input, select") &&
    !insideCellEditor
  ) {
    return;
  }
  if (event.button !== 0 || !event.isPrimary) {
    return;
  }
  const position = this.position(event.target);
  if (!position) {
    return;
  }
  if (event.shiftKey && this.range) {
    this.range = { anchor: this.range.anchor, head: position };
    this.highlight();
    event.preventDefault();
    return;
  }
  this.range = undefined;
  this.selectionDrag.begin(
    event,
    position,
    insideCellEditor
      ? undefined
      : this.environment.position(
          this.model.rows[position.row]![position.column]!.text,
          this.cells[position.row]![position.column]!,
          event,
        ),
    !!insideCellEditor,
  );
  if (!insideCellEditor) {
    event.preventDefault();
  }
}

export function highlight(this: TableController): void {
  const area = this.range && rectangle(this.range);
  this.cells.forEach((row, rowIndex) =>
    row.forEach((cell, column) => {
      const selected =
        !!area &&
        rowIndex >= area.top &&
        rowIndex <= area.bottom &&
        column >= area.left &&
        column <= area.right;
      cell.classList.toggle("table-cell-selected", selected);
      cell.setAttribute("aria-selected", String(selected));
    }),
  );
  if (this.range) {
    this.outer.state.facet(tableSelectionChanges)(true);
  }
}
