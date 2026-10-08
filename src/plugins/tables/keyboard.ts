import { editGroup } from "../document/api";

import { insertRow, rectangle, writeCells } from "../../markdown/tables/model";
import {
  arrowKeys,
  arrowStep,
  type ArrowKey,
  type CellStep,
} from "./navigation";

import { activeTables, tableSelectionChanges } from "./state";

import type { TableController } from "./controller";
export function keyDown(this: TableController, event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) {
    return;
  }
  const gridSelected = !!this.range && !this.inner;
  if (
    gridSelected &&
    arrowKeys.includes(event.key as ArrowKey) &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey
  ) {
    const rtl = getComputedStyle(this.root).direction === "rtl";
    this.arrow(arrowStep(event.key as ArrowKey, rtl), event.shiftKey);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    const position = this.range?.head ?? this.active;
    if (position) {
      event.preventDefault();
      event.stopPropagation();
      const bounds =
        this.cells[position.row]![position.column]!.getBoundingClientRect();
      this.showMenu(position, { x: bounds.left, y: bounds.bottom });
    }
    return;
  }
  if (
    !this.inner &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "z"
  ) {
    event.preventDefault();
    this.hostAction(event.shiftKey ? "redo" : "undo");
  }
  if (gridSelected && (event.key === "Backspace" || event.key === "Delete")) {
    event.preventDefault();
    this.replace(writeCells(this.model, this.range!, [[""]]));
  }
}

export function move(
  this: TableController,
  rowStep: number,
  columnStep: number,
): boolean {
  if (!this.active || this.inner?.composing) {
    return false;
  }
  let { row, column } = this.active;
  row += rowStep;
  column += columnStep;
  if (column >= this.model.alignments.length) {
    column = 0;
    row++;
  }
  if (column < 0) {
    column = this.model.alignments.length - 1;
    row--;
  }
  if (row < 0) {
    this.leave(-1);
    return true;
  }
  if (row >= this.model.rows.length) {
    this.requested = { row, column };
    this.replace(insertRow(this.model, this.model.rows.length - 1));
  } else {
    this.open({ row, column }, "all");
  }
  return true;
}

export function arrow(
  this: TableController,
  step: CellStep,
  extend: boolean,
): boolean {
  if (this.range && !extend) {
    const area = rectangle(this.range);
    const before = step.row < 0 || step.column < 0;
    const target = {
      row: before ? area.top : area.bottom,
      column: before ? area.left : area.right,
    };
    this.open(
      target,
      before ? 0 : this.model.rows[target.row]![target.column]!.text.length,
    );
    return true;
  }
  const current = this.range?.head ?? this.active;
  if (!current) {
    return false;
  }
  const target = {
    row: current.row + step.row,
    column: current.column + step.column,
  };
  if (extend) {
    if (!this.model.rows[target.row]?.[target.column]) {
      return true;
    }
    const anchor = this.range?.anchor ?? current;
    if (this.same(anchor, target)) {
      this.open(target, this.gridCursor);
      return true;
    }
    if (!this.range) {
      this.gridCursor = this.inner?.state.selection.main.head;
    }
    this.close();
    this.range = { anchor, head: target };
    activeTables.set(this.outer, this);
    this.highlight();
    this.root.focus();
    this.cells[target.row]![target.column]!.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    return true;
  }
  if (target.column < 0) {
    target.column = this.model.alignments.length - 1;
    target.row--;
  } else if (target.column >= this.model.alignments.length) {
    target.column = 0;
    target.row++;
  }
  const cell = this.model.rows[target.row]?.[target.column];
  if (cell) {
    this.open(target, step.column < 0 ? cell.text.length : 0);
  } else {
    this.leave(target.row < 0 ? -1 : 1);
  }
  return true;
}

export function leave(this: TableController, direction: -1 | 1): void {
  const doc = this.outer.state.doc;
  const edge = this.start() + (direction > 0 ? this.block.source.length : 0);
  const adjacent = doc.lineAt(edge).number + direction;
  this.close();
  this.range = undefined;
  activeTables.delete(this.outer);
  if (adjacent >= 1 && adjacent <= doc.lines) {
    this.outer.dispatch({
      selection: { anchor: doc.line(adjacent).from },
      scrollIntoView: true,
    });
  } else {
    // Keep newly typed prose separate from the table's Markdown rows.
    this.outer.dispatch({
      changes: { from: edge, insert: "\n\n" },
      selection: { anchor: edge + (direction > 0 ? 2 : 0) },
      annotations: editGroup.of(`table-command-${++this.operationSequence}`),
      scrollIntoView: true,
    });
  }
  this.highlight();
  this.outer.state.facet(tableSelectionChanges)(false);
  this.outer.focus();
}
