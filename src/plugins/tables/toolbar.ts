import {
  insertColumn,
  insertRow,
  rectangle,
  type CellPosition,
  type CellRange,
} from "../../markdown/tables/model";
import type { Axis, TableOperation } from "../../markdown/tables/operations";
import { tableMenu, type TableMenuActions } from "./menu";
import type { TableGrid } from "./grid";
import type { TableClipboard } from "./clipboard";
import type { TableEnvironment } from "./environment";

interface MenuSelection {
  range(): CellRange | undefined;
  active(): CellPosition | undefined;
  open(position: CellPosition): void;
  request(position: CellPosition): void;
  execute(operation: TableOperation, focus: CellPosition): void;
  selectAll(): void;
}

/** Toolbar and contextual menu lifetime, independent of cell-editor internals. */
export class TableToolbar {
  private closeMenu?: () => void;
  constructor(
    private readonly grid: TableGrid,
    private readonly selection: MenuSelection,
    private readonly clipboard: TableClipboard,
    private readonly openMenu: TableEnvironment["openMenu"],
  ) {}

  controls(): HTMLElement {
    const controls = document.createElement("div");
    controls.className = "table-controls";
    const button = (label: string, axis: Axis, run: () => void): void => {
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = "+";
      action.className = axis === "row" ? "table-row-btn" : "table-col-btn";
      action.setAttribute("aria-label", label);
      action.title = label;
      // Keep the focus in the cell, so the new cell opens in the same row.
      action.addEventListener("mousedown", (event) => event.preventDefault());
      action.addEventListener("click", run);
      controls.append(action);
    };
    button("Add row below", "row", () => {
      this.selection.request({ row: this.grid.model.rows.length, column: 0 });
      this.grid.replace(
        insertRow(this.grid.model, this.grid.model.rows.length - 1),
      );
    });
    button("Add column to the right", "column", () => {
      this.selection.request({
        row: this.selection.active()?.row ?? 0,
        column: this.grid.model.alignments.length,
      });
      this.grid.replace(
        insertColumn(this.grid.model, this.grid.model.alignments.length - 1),
      );
    });
    return controls;
  }

  contextMenu(event: MouseEvent): void {
    const position = this.grid.position(event.target);
    if (!position) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.showMenu(position, { x: event.clientX, y: event.clientY });
  }

  showMenu(
    position: CellPosition,
    point: { x: number; y: number },
    axis?: Axis,
  ): void {
    this.close();
    const range = this.selection.range();
    if (!containsCell(range, position)) {
      this.selection.open(position);
    }
    const selected = this.selection.range() ?? {
      anchor: { ...position },
      head: { ...position },
    };
    this.closeMenu = this.openMenu(
      this.grid.root,
      tableMenu(this.grid.model, selected, this.menuActions(selected), axis),
      point,
      (message) => this.report(message),
    );
  }

  private menuActions(range: CellRange): TableMenuActions {
    return {
      copy: (cut) => this.clipboard.copyFromMenu(range, cut),
      paste: () => this.clipboard.pasteFromMenu(range),
      selectAll: () => this.selection.selectAll(),
      canFormat: this.clipboard.canFormat,
      format: (marker) => this.clipboard.formatCells(range, marker),
      clear: () => this.clipboard.clearCells(range),
      execute: (operation, focus) => this.selection.execute(operation, focus),
    };
  }

  private report(message: string): void {
    let notice = this.grid.root.querySelector<HTMLElement>(".table-message");
    if (!notice) {
      notice = document.createElement("p");
      notice.className = "table-message";
      notice.setAttribute("role", "alert");
      this.grid.root.append(notice);
    }
    notice.textContent = message;
  }

  close(): void {
    this.closeMenu?.();
    delete this.closeMenu;
  }
}

export function containsCell(
  range: CellRange | undefined,
  position: CellPosition,
): boolean {
  if (!range) {
    return false;
  }
  const area = rectangle(range);
  return (
    position.row >= area.top &&
    position.row <= area.bottom &&
    position.column >= area.left &&
    position.column <= area.right
  );
}
