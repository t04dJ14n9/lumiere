import { editGroup } from "../document/api";
import {
  insertRow,
  rectangle,
  writeCells,
  type CellPosition,
  type CellRange,
} from "../../markdown/tables/model";
import {
  arrowKeys,
  arrowStep,
  type ArrowKey,
  type CellStep,
} from "./navigation";
import { tableSelectionChanges } from "./state";
import { sameCell, type TableGrid } from "./grid";
import type { CellProjection } from "./projection";
import type { TableSelection } from "./selection";

interface KeyboardActions {
  request(position: CellPosition): void;
  deactivate(): void;
  menu(position: CellPosition, point: { x: number; y: number }): void;
}

/** Routes grid keys and cell-boundary movement; ordinary typing stays in the cell. */
export class TableKeyboard {
  private entryColumn = 0;
  constructor(
    private readonly grid: TableGrid,
    private readonly projection: CellProjection,
    private readonly selection: TableSelection,
    private readonly actions: KeyboardActions,
  ) {}

  keyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }
    const gridSelected = !!this.selection.range && !this.projection.inner;
    if (this.routeGridKey(event, gridSelected)) {
      return;
    }
    if (
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey)
    ) {
      this.openMenu(event);
      return;
    }
    if (!this.projection.inner && isUndoShortcut(event)) {
      event.preventDefault();
      this.projection.hostAction(event.shiftKey ? "redo" : "undo");
    }
    if (gridSelected && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault();
      this.grid.replace(
        writeCells(this.grid.model, this.selection.range!, [[""]]),
      );
    }
  }

  private routeGridKey(event: KeyboardEvent, gridSelected: boolean): boolean {
    if (!gridSelected) {
      return false;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      this.selection.selectAll();
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    if (isGridArrow(event)) {
      const rtl = getComputedStyle(this.grid.root).direction === "rtl";
      this.arrow(arrowStep(event.key as ArrowKey, rtl), event.shiftKey);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    return this.enterSelectedCell(event);
  }

  private enterSelectedCell(event: KeyboardEvent): boolean {
    const range = this.selection.range;
    if (
      !range ||
      !sameCell(range.anchor, range.head) ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey ||
      (event.key !== "Enter" && Array.from(event.key).length !== 1)
    ) {
      return false;
    }
    this.openGridCell(range.head);
    const inner = this.projection.inner;
    if (!inner) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    // Focus alone loses the grid's initiating key. Let the cell's keymap
    // (including Vim) claim it before supplying synthetic text input.
    const unhandled = inner.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", event),
    );
    if (unhandled && event.key !== "Enter") {
      inner.dispatch(inner.state.replaceSelection(event.key), {
        userEvent: "input.type",
        scrollIntoView: true,
      });
    }
    return true;
  }

  private openGridCell(position: CellPosition): void {
    const length =
      this.grid.model.rows[position.row]![position.column]!.text.length;
    // Source edits can shorten a cell while its saved grid caret survives.
    const offset = Math.max(
      0,
      Math.min(this.selection.gridCursor ?? length, length),
    );
    this.projection.open(position, offset);
  }

  private openMenu(event: KeyboardEvent): void {
    const position = this.selection.range?.head ?? this.projection.active;
    if (!position) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const bounds =
      this.grid.cells[position.row]![position.column]!.getBoundingClientRect();
    this.actions.menu(position, { x: bounds.left, y: bounds.bottom });
  }

  move(rowStep: number, columnStep: number): boolean {
    if (!this.projection.active || this.projection.inner?.composing) {
      return false;
    }
    const target = wrapCell(
      {
        row: this.projection.active.row + rowStep,
        column: this.projection.active.column + columnStep,
      },
      this.grid.model.alignments.length,
    );
    if (target.row < 0) {
      this.leave(-1);
      return true;
    }
    if (target.row >= this.grid.model.rows.length) {
      this.actions.request(target);
      this.grid.replace(
        insertRow(this.grid.model, this.grid.model.rows.length - 1),
      );
    } else {
      this.projection.open(target, "all");
    }
    return true;
  }

  arrow(step: CellStep, extend: boolean): boolean {
    const range = this.selection.range;
    if (range && !extend) {
      return this.collapseSelection(range, step);
    }
    const current = range?.head ?? this.projection.active;
    if (!current) {
      return false;
    }
    const target = {
      row: current.row + step.row,
      column: current.column + step.column,
    };
    if (extend) {
      return this.extendSelection(current, target);
    }
    const wrapped = wrapCell(target, this.grid.model.alignments.length);
    const cell = this.grid.model.rows[wrapped.row]?.[wrapped.column];
    if (cell) {
      this.projection.open(wrapped, step.column < 0 ? cell.text.length : 0);
    } else {
      this.leave(wrapped.row < 0 ? -1 : 1);
    }
    return true;
  }

  private collapseSelection(range: CellRange, step: CellStep): boolean {
    const area = rectangle(range);
    const before = step.row < 0 || step.column < 0;
    const target = {
      row: before ? area.top : area.bottom,
      column: before ? area.left : area.right,
    };
    this.selection.gridCursor = before
      ? 0
      : this.grid.model.rows[target.row]![target.column]!.text.length;
    if (!sameCell(range.anchor, range.head)) {
      // Collapse in grid mode so the next Shift arrow extends cells rather
      // than selecting text inside a newly opened cell editor.
      this.selection.select({ anchor: target, head: target });
      this.grid.root.focus();
      return true;
    }
    this.openGridCell(target);
    return true;
  }

  private extendSelection(
    current: CellPosition,
    target: CellPosition,
  ): boolean {
    if (!this.grid.model.rows[target.row]?.[target.column]) {
      return true;
    }
    const anchor = this.selection.range?.anchor ?? current;
    if (sameCell(anchor, target)) {
      this.openGridCell(target);
      return true;
    }
    if (!this.selection.range) {
      const head = this.projection.inner?.state.selection.main.head;
      if (head === undefined) {
        delete this.selection.gridCursor;
      } else {
        this.selection.gridCursor = head;
      }
    }
    this.selection.select({ anchor, head: target });
    this.grid.root.focus();
    this.grid.cells[target.row]![target.column]!.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    return true;
  }

  leave(direction: -1 | 1): void {
    const outer = this.grid.outer;
    const doc = outer.state.doc;
    const edge =
      this.grid.start() + (direction > 0 ? this.grid.block.source.length : 0);
    const adjacent = doc.lineAt(edge).number + direction;
    this.entryColumn =
      this.projection.active?.column ?? this.selection.range?.head.column ?? 0;
    this.projection.close();
    delete this.selection.range;
    this.actions.deactivate();
    if (adjacent >= 1 && adjacent <= doc.lines) {
      outer.dispatch({
        selection: { anchor: doc.line(adjacent).from },
        scrollIntoView: true,
      });
    } else {
      // Keep newly typed prose separate from the table's Markdown rows.
      outer.dispatch({
        changes: { from: edge, insert: "\n\n" },
        selection: { anchor: edge + (direction > 0 ? 2 : 0) },
        annotations: editGroup.of(this.grid.commandGroup()),
        scrollIntoView: true,
      });
    }
    this.selection.highlight();
    outer.state.facet(tableSelectionChanges)(false);
    outer.focus();
  }

  enter(direction: -1 | 1): void {
    this.projection.open(
      {
        row: direction < 0 ? this.grid.model.rows.length - 1 : 0,
        column: Math.min(
          this.entryColumn,
          this.grid.model.alignments.length - 1,
        ),
      },
      direction < 0 ? "all" : 0,
    );
  }
}

function isGridArrow(event: KeyboardEvent): boolean {
  return (
    arrowKeys.includes(event.key as ArrowKey) &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey
  );
}

export function wrapCell(
  position: CellPosition,
  columns: number,
): CellPosition {
  if (position.column >= columns) {
    return { row: position.row + 1, column: 0 };
  }
  if (position.column < 0) {
    return { row: position.row - 1, column: columns - 1 };
  }
  return position;
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z";
}
