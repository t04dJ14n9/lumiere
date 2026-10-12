import { editGroup } from "../document/api";
import {
  parseTable,
  writeCells,
  type CellPosition,
} from "../../markdown/tables/model";
import { tableSourceChanges } from "./source-edits";
import { CellEditor } from "./cell-editor";
import type { Action, TableEnvironment } from "./environment";
import { tableActions, tableSelectionChanges, tableProjection } from "./state";
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
    const element = this.grid.contentElement(position);
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
    this.cellEditor?.source.remember(text);
    const changes = projectedChanges(
      this.grid.block.source,
      position,
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
        annotations: tableProjection.of(true),
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
      this.grid.outer.state.facet(tableSelectionChanges)(false);
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
    const element = this.grid.contentElement(position)!;
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
      this.grid.model.alignments[this.active.column] ?? null,
    );
  }
}

export function projectedChanges(
  source: string,
  position: CellPosition,
  text: string,
  start: number,
) {
  const table = parseTable(source);
  if (!table) {
    return [];
  }
  const next = writeCells(table, { anchor: position, head: position }, [
    [text],
  ]);
  return tableSourceChanges(table, next).map((change) => ({
    ...change,
    from: start + change.from,
    to: start + change.to,
  }));
}
