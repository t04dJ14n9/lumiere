import {
  rectangle,
  type CellPosition,
  type CellRange,
} from "../../markdown/tables/model";
import type { Axis } from "../../markdown/tables/operations";
import { tableSelectionChanges } from "./state";
import type { TableGrid } from "./grid";
import type { CellProjection } from "./projection";
import type { TableEnvironment } from "./environment";
import { TableSelectionDrag } from "./selection-drag";

interface SelectionActions {
  activate(): void;
  setHandle(position: CellPosition): void;
}

/** Grid selection and pointer gestures; cell-text selection stays in CodeMirror. */
export class TableSelection {
  range?: CellRange | undefined;
  gridCursor?: number;
  readonly drag: TableSelectionDrag;

  constructor(
    private readonly grid: TableGrid,
    private readonly projection: CellProjection,
    private readonly actions: SelectionActions,
    private readonly positionInText: TableEnvironment["position"],
  ) {
    this.drag = new TableSelectionDrag(
      grid.root,
      grid.table,
      { vertical: grid.outer.scrollDOM, horizontal: grid.scroll },
      {
        select: (anchor, head) => {
          this.select({ anchor, head });
          window.getSelection()?.removeAllRanges();
          grid.root.focus({ preventScroll: true });
        },
        finish: (origin, offset, selected) => {
          if (selected) {
            grid.root.focus({ preventScroll: true });
          } else {
            projection.open(origin, offset);
          }
        },
      },
    );
  }

  activate(range: CellRange): void {
    this.projection.close();
    this.range = range;
    this.actions.activate();
  }

  select(range: CellRange): void {
    this.activate(range);
    this.highlight();
  }

  selectAll(): void {
    const inner = this.projection.inner;
    if (inner && !this.range) {
      inner.dispatch({
        selection: { anchor: 0, head: inner.state.doc.length },
      });
      inner.focus();
      return;
    }
    this.select({
      anchor: { row: 0, column: 0 },
      head: {
        row: this.grid.model.rows.length - 1,
        column: this.grid.model.alignments.length - 1,
      },
    });
    this.grid.root.focus();
  }

  sourceRange(): { from: number; to: number } | undefined {
    const start = this.grid.start();
    if (this.range) {
      const area = rectangle(this.range);
      return {
        from: start + this.grid.model.rows[area.top]![area.left]!.from,
        to: start + this.grid.model.rows[area.bottom]![area.right]!.to,
      };
    }
    const { active, cellEditor } = this.projection;
    if (!active || !cellEditor) {
      return undefined;
    }
    const cell = this.grid.model.rows[active.row]?.[active.column];
    if (!cell) {
      return undefined;
    }
    const range = cellEditor.source.range(
      this.grid.block.source,
      cell,
      this.grid.model.alignments[active.column] ?? null,
    );
    const selection = cellEditor.view.state.selection.main;
    return {
      from: start + range.from + selection.from,
      to: start + range.from + selection.to,
    };
  }

  selectAxis(axis: Axis, index: number, focus = true): void {
    this.activate(axisRange(this.grid.model, axis, index));
    delete this.gridCursor;
    this.actions.setHandle(this.range!.anchor);
    this.highlight();
    if (focus) {
      this.grid.root.focus({ preventScroll: true });
    }
  }

  pointerDown(event: PointerEvent): void {
    const insideCellEditor =
      event.target instanceof Node &&
      this.projection.inner?.dom.contains(event.target);
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
    const position = this.grid.position(event.target);
    if (!position) {
      return;
    }
    if (event.shiftKey && this.range) {
      this.range = { anchor: this.range.anchor, head: position };
      this.highlight();
      event.preventDefault();
      return;
    }
    delete this.range;
    const offset = insideCellEditor
      ? undefined
      : this.positionInText(
          this.grid.model.rows[position.row]![position.column]!.text,
          this.grid.contentElement(position)!,
          event,
        );
    this.drag.begin(event, position, offset, !!insideCellEditor);
    if (!insideCellEditor) {
      event.preventDefault();
    }
  }

  highlight(): void {
    const selected = selectedCells(
      {
        rows: this.grid.cells.length,
        columns: this.grid.cells[0]?.length ?? 0,
      },
      this.range,
      this.projection.active,
    );
    // Without a grid range the one selected cell is the one being edited,
    // whose own text selection must stay visible (tables.css).
    const isEditing = !this.range;
    this.grid.cells.forEach((row, rowIndex) =>
      row.forEach((cell, column) => {
        const on = selected[rowIndex]?.[column] ?? false;
        cell.classList.toggle("table-cell-selected", on);
        cell.classList.toggle("is-editing", on && isEditing);
        cell.setAttribute("aria-selected", String(on));
      }),
    );
    if (this.range) {
      this.grid.outer.state.facet(tableSelectionChanges)(true);
    }
  }
}

/** Grid range wins; otherwise the open cell editor still shows selection chrome. */
export function selectedCells(
  shape: { rows: number; columns: number },
  range: CellRange | undefined,
  active: CellPosition | undefined,
): boolean[][] {
  const area = range && rectangle(range);
  return Array.from({ length: shape.rows }, (_, row) =>
    Array.from({ length: shape.columns }, (_, column) => {
      if (area) {
        return (
          row >= area.top &&
          row <= area.bottom &&
          column >= area.left &&
          column <= area.right
        );
      }
      return !!active && active.row === row && active.column === column;
    }),
  );
}

export function axisRange(
  shape: { rows: readonly unknown[]; alignments: readonly unknown[] },
  axis: Axis,
  index: number,
): CellRange {
  if (axis === "row") {
    return {
      anchor: { row: index, column: 0 },
      head: { row: index, column: shape.alignments.length - 1 },
    };
  }
  return {
    anchor: { row: 0, column: index },
    head: { row: shape.rows.length - 1, column: index },
  };
}
