import { editGroup } from "../document/api";

import {
  materializeCell,
  parseTable,
  type CellPosition,
} from "../../markdown/tables/model";
import {
  operateTable,
  type TableOperation,
} from "../../markdown/tables/operations";
import { difference } from "../../shared/document/wire";
import { CellEditor } from "./cell-editor";
import type { Action } from "./environment";

import { activeTables, tableActions, tableSelectionChanges } from "./state";

import type { TableController } from "./controller";
export function open(
  this: TableController,
  position: CellPosition,
  selection?: number | "all",
): void {
  const cell = this.model.rows[position.row]?.[position.column];
  const element = this.cells[position.row]?.[position.column];
  if (!cell || !element) {
    return;
  }
  if (this.same(this.active, position) && this.inner) {
    this.inner.focus();
    return;
  }
  this.close();
  this.range = undefined;
  this.active = position;
  this.handles.setActive(position);
  activeTables.set(this.outer, this);
  this.environment.disposeContent(element);
  element.replaceChildren();
  this.cellEditor = new CellEditor({
    parent: element,
    cell,
    position,
    selection,
    environment: this.environment,
    vim: this.vimEnabled(),
    outer: this.outer,
    action: (action) => this.hostAction(action),
    move: (row, column) => this.move(row, column),
    arrow: (step, extend) => this.arrow(step, extend),
    selected: (selected) =>
      this.outer.state.facet(tableSelectionChanges)(selected),
    change: (text, group) => {
      const current = this.model.rows[position.row]![position.column]!;
      if (current.missing) {
        const change = materializeCell(this.model, position, text);
        this.cellEditor!.source.materialize();
        this.outer.dispatch({
          changes: {
            from: this.start() + change.from,
            insert: change.insert,
          },
          annotations: editGroup.of(group),
        });
        return;
      }
      const { from, to } = this.cellEditor!.source.range(
        this.block.source,
        current,
      );
      const start = this.start();
      const changes: { from: number; to: number; insert: string }[] = [];
      difference(this.block.source.slice(from, to), text).iterChanges(
        (fromA, toA, _fromB, _toB, insert) => {
          changes.push({
            from: start + from + fromA,
            to: start + from + toA,
            insert: insert.toString(),
          });
        },
      );
      this.outer.dispatch({ changes, annotations: editGroup.of(group) });
    },
  });
  const editor = this.cellEditor;
  // Structural commands may open a cell during the outer view's update.
  queueMicrotask(() => {
    if (this.cellEditor === editor && this.active && this.root.isConnected) {
      const current = this.model.rows[this.active.row]![this.active.column]!;
      this.outer.dispatch({
        selection: { anchor: this.start() + current.from },
      });
    }
  });
  this.cellEditor.view.focus();
  this.highlight();
  this.outer.state.facet(tableSelectionChanges)(
    !this.cellEditor.view.state.selection.main.empty,
  );
}

export function close(this: TableController): void {
  const active = this.active;
  this.cellEditor?.destroy();
  this.cellEditor = undefined;
  this.active = undefined;
  if (active) {
    this.display(active);
  }
}

export function hostAction(this: TableController, action: Action): boolean {
  this.outer.state.facet(tableActions)(action);
  return true;
}

export function execute(
  this: TableController,
  operation: TableOperation,
  focus: CellPosition,
): void {
  const source = operateTable(this.model, operation);
  if (source === this.block.source) {
    (this.inner ?? this.outer).focus();
    return;
  }
  const next = parseTable(source);
  this.close();
  this.range = undefined;
  this.requested = next
    ? {
        row: Math.max(0, Math.min(focus.row, next.rows.length - 1)),
        column: Math.max(0, Math.min(focus.column, next.alignments.length - 1)),
      }
    : undefined;
  this.replace(source);
  if (!next) {
    this.outer.focus();
  }
}

export function replace(this: TableController, source: string): void {
  if (source === this.block.source) {
    return;
  }
  const from = this.start();
  this.outer.dispatch({
    changes: { from, to: from + this.block.source.length, insert: source },
    annotations: editGroup.of(`table-command-${++this.operationSequence}`),
  });
}
