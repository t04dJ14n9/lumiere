import { editGroup } from "../document/api";
import {
  materializeCell,
  type CellPosition,
} from "../../markdown/tables/model";
import { difference } from "../../shared/document/wire";
import { CellEditor } from "./cell-editor";
import type { Action, TableEnvironment } from "./environment";
import { tableActions, tableSelectionChanges } from "./state";
import { sameCell, type TableGrid } from "./grid";
import type { CellStep } from "./navigation";

interface ProjectionActions {
  activate(position: CellPosition): void;
  highlight(): void;
  move(row: number, column: number): boolean;
  arrow(step: CellStep, extend: boolean): boolean;
}

/** One cell editor projects text into the outer document, including missing cells. */
export class CellProjection {
  active?: CellPosition;
  cellEditor?: CellEditor;
  get inner() {
    return this.cellEditor?.view;
  }

  constructor(
    private readonly grid: TableGrid,
    private readonly environment: TableEnvironment,
    private readonly actions: ProjectionActions,
  ) {}

  open(position: CellPosition, selection?: number | "all"): void {
    const cell = this.grid.model.rows[position.row]?.[position.column];
    const element = this.grid.cells[position.row]?.[position.column];
    if (!cell || !element) {
      return;
    }
    if (sameCell(this.active, position) && this.inner) {
      this.inner.focus();
      return;
    }
    this.close();
    this.active = position;
    this.actions.activate(position);
    this.environment.disposeContent(element);
    element.replaceChildren();
    this.cellEditor = new CellEditor({
      parent: element,
      cell,
      position,
      ...(selection === undefined ? {} : { selection }),
      environment: this.environment,
      vim: this.environment.vim !== undefined,
      outer: this.grid.outer,
      action: (action) => this.hostAction(action),
      move: (row, column) => this.actions.move(row, column),
      arrow: (step, extend) => this.actions.arrow(step, extend),
      selected: (selected) =>
        this.grid.outer.state.facet(tableSelectionChanges)(selected),
      change: (text, group) => this.projectChange(position, text, group),
    });
    this.deferOuterCaret(this.cellEditor);
    this.cellEditor.view.focus();
    this.actions.highlight();
    this.grid.outer.state.facet(tableSelectionChanges)(
      !this.cellEditor.view.state.selection.main.empty,
    );
  }

  private projectChange(
    position: CellPosition,
    text: string,
    group: string,
  ): void {
    const current = this.grid.model.rows[position.row]![position.column]!;
    const editor = this.cellEditor!;
    if (current.missing) {
      const change = materializeCell(this.grid.model, position, text);
      editor.source.materialize();
      this.grid.outer.dispatch({
        changes: {
          from: this.grid.start() + change.from,
          insert: change.insert,
        },
        annotations: editGroup.of(group),
      });
      return;
    }
    const { from, to } = editor.source.range(this.grid.block.source, current);
    const changes = projectedChanges(
      this.grid.block.source,
      { from, to },
      text,
      this.grid.start(),
    );
    this.grid.outer.dispatch({ changes, annotations: editGroup.of(group) });
  }

  private deferOuterCaret(editor: CellEditor): void {
    // A structural command can open the cell during the outer view's update.
    // Delay dispatch, and reject work from an editor closed in the meantime.
    queueMicrotask(() => {
      if (
        this.cellEditor !== editor ||
        !this.active ||
        !this.grid.root.isConnected
      ) {
        return;
      }
      const cell = this.grid.model.rows[this.active.row]![this.active.column]!;
      this.grid.outer.dispatch({
        selection: { anchor: this.grid.start() + cell.from },
      });
    });
  }

  close(): void {
    const active = this.active;
    this.cellEditor?.destroy();
    delete this.cellEditor;
    delete this.active;
    if (active) {
      this.grid.display(active);
    }
  }

  hostAction(action: Action): boolean {
    this.grid.outer.state.facet(tableActions)(action);
    return true;
  }

  relocate(position: CellPosition): void {
    if (!this.active || !this.cellEditor) {
      return;
    }
    const view = this.cellEditor.view;
    const focused = view.hasFocus;
    // Keep the position object captured by the cell's change callback alive.
    Object.assign(this.active, position);
    this.grid.render();
    const element = this.grid.cells[position.row]![position.column]!;
    this.environment.disposeContent(element);
    element.replaceChildren(view.dom);
    this.cellEditor.label(position);
    if (focused) {
      view.focus();
    }
  }

  update(): void {
    if (!this.active || !this.cellEditor) {
      return;
    }
    this.cellEditor.update(
      this.grid.block.source,
      this.grid.model.rows[this.active.row]![this.active.column]!,
      this.environment.vim !== undefined,
    );
  }
}

export function projectedChanges(
  source: string,
  range: { from: number; to: number },
  text: string,
  start: number,
) {
  const changes: { from: number; to: number; insert: string }[] = [];
  difference(source.slice(range.from, range.to), text).iterChanges(
    (...change) => {
      const [from, to, , , insert] = change;
      changes.push({
        from: start + range.from + from,
        to: start + range.from + to,
        insert: insert.toString(),
      });
    },
  );
  return changes;
}
