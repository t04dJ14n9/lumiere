import { editGroup } from "../document/api";
import {
  parseTable,
  writeCells,
  type CellPosition,
} from "../../markdown/tables/model";
import { tableSourceChanges } from "./source-edits";
import { CellEditor } from "./cell-editor";
import type { Action, TableEnvironment } from "./environment";
import {
  activeTables,
  tableActions,
  tableSelectionChanges,
  tableProjection,
} from "./state";
import { sameCell, type TableGrid } from "./grid";
import type { CellStep } from "./navigation";
import { tableWordTarget, type WordMotion } from "./word-motion";

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
  private cellSessionRevision = 0;

  get sessionRevision(): number {
    return this.cellSessionRevision;
  }

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
      word: (motion, count) => this.moveWord(motion, count),
      documentLine: (line) => this.moveDocumentLine(line),
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

  private moveDocumentLine(target: number | "last"): boolean {
    const editor = this.cellEditor;
    if (!editor) {
      return false;
    }
    const outer = this.grid.outer;
    const doc = outer.state.doc;
    const number = target === "last" ? doc.lines : target;
    const line = doc.line(Math.max(1, Math.min(doc.lines, number)));
    const firstCharacter = line.text.search(/\S/);
    const head = line.from + Math.max(0, firstCharacter);
    const release = this.environment.vim?.handoff(editor.view, outer);
    // Detach logically before another mapped/replayed key runs. Only teardown
    // waits: Vim still finishes the current motion against its cell adapter.
    const active = this.active;
    delete this.cellEditor;
    delete this.active;
    queueMicrotask(() => {
      try {
        editor.destroy();
      } finally {
        release?.();
      }
    });
    if (active) {
      this.grid.display(active);
    }
    outer.state.facet(tableSelectionChanges)(false);
    activeTables.delete(outer);
    this.actions.highlight();
    // A document jump may land on table source; keep it in the outer view.
    outer.dispatch({
      selection: { anchor: head },
      annotations: tableProjection.of(true),
      scrollIntoView: true,
    });
    outer.focus();
    return true;
  }

  private moveWord(motion: WordMotion, count: number): boolean {
    if (!this.active || !this.inner) {
      return false;
    }
    const active = this.active;
    const text = this.inner.state.doc.toString();
    const target = tableWordTarget({
      // The session can retain whitespace that serialization treats as padding.
      cells: this.grid.model.rows.map((row, rowIndex) =>
        row.map((cell, column) =>
          sameCell(active, { row: rowIndex, column }) ? text : cell.text,
        ),
      ),
      current: { ...this.active, head: this.inner.state.selection.main.head },
      motion,
      count,
    });
    if (!target) {
      return true;
    }
    if (sameCell(this.active, target)) {
      this.inner.dispatch({
        selection: { anchor: target.head },
        scrollIntoView: true,
      });
    } else {
      this.retargetWordCell(target);
    }
    return true;
  }

  private retargetWordCell(target: CellPosition & { head: number }): void {
    const editor = this.cellEditor;
    const active = this.active;
    const cell = this.grid.model.rows[target.row]?.[target.column];
    const element = this.grid.contentElement(target);
    if (!editor || !active || !cell || !element) {
      return;
    }
    const previous = { ...active };
    // Retaining the view must still invalidate async work from the previous cell.
    this.cellSessionRevision++;
    // The edit callback captures this object; retain it when the view changes cells.
    Object.assign(active, { row: target.row, column: target.column });
    this.actions.activate(active);
    this.environment.disposeContent(element);
    element.replaceChildren(editor.view.dom);
    this.grid.display(previous);
    editor.retarget(cell, active, target.head);
    this.deferOuterCaret(editor);
    editor.view.focus();
    this.actions.highlight();
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
    if (!sameCell(this.active, position)) {
      this.cellSessionRevision++;
    }
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

  /** Keep typing in the open cell after an outer rewrite remaps selection. */
  retainFocus(): void {
    const editor = this.cellEditor;
    if (!editor || !this.active) {
      return;
    }
    editor.view.focus();
    this.deferOuterCaret(editor);
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
