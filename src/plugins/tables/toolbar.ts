import {
  insertColumn,
  insertRow,
  rectangle,
  type CellPosition,
  type CellRange,
} from "../../markdown/tables/model";
import { type Axis } from "../../markdown/tables/operations";
import { tableMenu, type TableMenuActions } from "./menu";

import { revealTableSource } from "./state";

import type { TableController } from "./controller";
export function controls(this: TableController): HTMLElement {
  const controls = document.createElement("div");
  controls.className = "table-controls";
  const button = (label: string, run: () => void): void => {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = label;
    action.addEventListener("click", run);
    controls.append(action);
  };
  button("Add row below", () => {
    this.requested = { row: this.model.rows.length, column: 0 };
    this.replace(insertRow(this.model, this.model.rows.length - 1));
  });
  button("Add column to the right", () => {
    this.requested = {
      row: this.active?.row ?? 0,
      column: this.model.alignments.length,
    };
    this.replace(insertColumn(this.model, this.model.alignments.length - 1));
  });
  button("Edit table source", () => this.revealSource());
  return controls;
}

export function revealSource(this: TableController): void {
  const from = this.start();
  this.outer.dispatch({
    effects: revealTableSource.of(from),
    selection: { anchor: from },
  });
  this.outer.focus();
}

export function contextMenu(this: TableController, event: MouseEvent): void {
  const position = this.position(event.target);
  if (!position) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  this.showMenu(position, { x: event.clientX, y: event.clientY });
}

export function showMenu(
  this: TableController,
  position: CellPosition,
  point: { x: number; y: number },
  axis?: Axis,
): void {
  this.closeMenu?.();
  const selected = this.range && rectangle(this.range);
  const inside =
    selected &&
    position.row >= selected.top &&
    position.row <= selected.bottom &&
    position.column >= selected.left &&
    position.column <= selected.right;
  if (!inside) {
    this.open(position);
  }
  const range = this.range ?? {
    anchor: { ...position },
    head: { ...position },
  };
  this.closeMenu = this.environment.openMenu(
    this.root,
    tableMenu(this.model, range, this.menuActions(range), axis),
    point,
    (message) => this.report(message),
  );
}

export function menuActions(
  this: TableController,
  range: CellRange,
): TableMenuActions {
  return {
    copy: (cut) => this.copyFromMenu(range, cut),
    paste: () => this.pasteFromMenu(range),
    format: (marker) => this.formatCells(range, marker),
    clear: () => this.clearCells(range),
    execute: (operation, focus) => this.execute(operation, focus),
    source: () => this.revealSource(),
  };
}

export function report(this: TableController, message: string): void {
  let notice = this.root.querySelector<HTMLElement>(".table-message");
  if (!notice) {
    notice = document.createElement("p");
    notice.className = "table-message";
    notice.setAttribute("role", "alert");
    this.root.append(notice);
  }
  notice.textContent = message;
}
