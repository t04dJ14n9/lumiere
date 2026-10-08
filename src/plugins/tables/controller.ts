import type { EditorView } from "@codemirror/view";
import {
  clearCells,
  copy,
  copyFromMenu,
  formatCells,
  paste,
  pasteFromMenu,
  pasteText,
} from "./clipboard";
import type { TableEnvironment } from "./environment";
import { arrow, keyDown, leave, move } from "./keyboard";
import { close, execute, hostAction, open, replace } from "./projection";
import {
  highlight,
  pointerDown,
  position,
  selectAxis,
  selection,
} from "./selection";
import {
  contextMenu,
  controls,
  menuActions,
  report,
  revealSource,
  showMenu,
} from "./toolbar";

import {
  cellAtOffset,
  parseTable,
  type CellPosition,
  type CellRange,
  type Table,
} from "../../markdown/tables/model";
import { operateTable } from "../../markdown/tables/operations";
import { difference } from "../../shared/document/wire";
import type { RenderBlock } from "../livePreview/api";
import type { CellEditor } from "./cell-editor";
import { TableHandles } from "./handles";
import { TableSelectionDrag } from "./selection-drag";

import { activeTables } from "./state";

/** A table projects every cell edit into the outer Markdown document. */
export class TableController {
  operationSequence = 0;
  model: Table;
  block: RenderBlock;
  readonly table = document.createElement("table");
  cells: HTMLElement[][] = [];
  active?: CellPosition;
  cellEditor?: CellEditor;
  range?: CellRange;
  gridCursor?: number;
  readonly selectionDrag: TableSelectionDrag;
  requested?: CellPosition;
  readonly events = new AbortController();
  closeMenu?: () => void;
  readonly handles: TableHandles;

  get inner(): EditorView | undefined {
    return this.cellEditor?.view;
  }

  get editor(): EditorView | undefined {
    return this.inner;
  }

  constructor(
    readonly root: HTMLElement,
    public outer: EditorView,
    block: RenderBlock,
    readonly environment: TableEnvironment,
  ) {
    this.block = block;
    this.model = parseTable(block.source)!;
    this.table.className = "markdown-rendered";
    this.table.setAttribute("aria-label", "Markdown table");
    root.append(this.table);
    outer.dom.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.target instanceof Node &&
          !root.contains(event.target) &&
          activeTables.get(outer) === this
        ) {
          activeTables.delete(outer);
          this.close();
          this.range = undefined;
          this.highlight();
        }
      },
      { capture: true, signal: this.events.signal },
    );
    root.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.selectionDrag = new TableSelectionDrag(
      root,
      this.table,
      outer.scrollDOM,
      {
        select: (anchor, head) => {
          this.close();
          this.range = { anchor, head };
          activeTables.set(this.outer, this);
          window.getSelection()?.removeAllRanges();
          this.highlight();
          this.root.focus({ preventScroll: true });
        },
        finish: (origin, offset, selected) => {
          if (selected) {
            this.root.focus({ preventScroll: true });
          } else {
            this.open(origin, offset);
          }
        },
      },
    );
    root.addEventListener("copy", (event) => this.copy(event, false));
    root.addEventListener("cut", (event) => this.copy(event, true));
    root.addEventListener("paste", (event) => this.paste(event));
    root.addEventListener("contextmenu", (event) => this.contextMenu(event));
    root.addEventListener("keydown", (event) => this.keyDown(event));
    root.append(this.controls());
    this.render();
    this.handles = new TableHandles(root, this.table, outer.scrollDOM, {
      select: (axis, index) => this.selectAxis(axis, index),
      move: (axis, from, to) => {
        this.replace(
          operateTable(this.model, {
            type: "move",
            axis,
            from,
            to: from,
            destination: to,
          }),
        );
        this.selectAxis(axis, to);
      },
      menu: (axis, index, point) => {
        this.selectAxis(axis, index, false);
        this.showMenu(this.range!.head, point, axis);
      },
    });
    this.handles.refresh();
  }

  update(block: RenderBlock, outer: EditorView): void {
    if (block.source !== this.block.source) {
      this.handles.cancel();
      this.selectionDrag.cancel();
      this.closeMenu?.();
      this.closeMenu = undefined;
    }
    this.outer = outer;
    const model = parseTable(block.source);
    if (!model) {
      return;
    }
    const shapeChanged =
      model.rows.length !== this.model.rows.length ||
      model.alignments.length !== this.model.alignments.length;
    let moved: CellPosition | undefined;
    if (shapeChanged && this.active && !this.requested) {
      const previous = this.model.rows[this.active.row]![this.active.column]!;
      moved = cellAtOffset(
        model,
        difference(this.block.source, block.source).mapPos(previous.from, 1),
      );
    }
    this.block = block;
    this.model = model;
    if (shapeChanged) {
      this.range = undefined;
      if (moved && this.inner && this.active) {
        const focused = this.inner.hasFocus;
        // Move the existing cell editor so its caret and Vim
        // session survive rows inserted by another view.
        Object.assign(this.active, moved);
        this.render();
        const element = this.cells[moved.row]![moved.column]!;
        this.environment.disposeContent(element);
        element.replaceChildren(this.inner.dom);
        this.cellEditor!.label(moved);
        if (focused) {
          this.inner.focus();
        }
      } else {
        this.close();
        this.render();
      }
    } else {
      for (let row = 0; row < this.cells.length; row++) {
        for (let column = 0; column < this.cells[row]!.length; column++) {
          if (!this.same(this.active, { row, column })) {
            this.display({ row, column });
          }
        }
      }
    }
    if (this.cellEditor && this.active) {
      this.cellEditor.update(
        this.block.source,
        this.model.rows[this.active.row]![this.active.column]!,
        this.vimEnabled(),
      );
    }
    if (this.requested) {
      const next = this.requested;
      this.requested = undefined;
      this.open(next, "all");
    }
    this.highlight();
    this.handles.refresh();
  }

  keyDown = keyDown;

  /** Add row, add column and edit source buttons beside the table. */
  controls = controls;

  revealSource = revealSource;

  start(): number {
    return this.outer.posAtDOM(this.root);
  }
  vimEnabled(): boolean {
    return this.environment.vim !== undefined;
  }
  same(left: CellPosition | undefined, right: CellPosition): boolean {
    return left?.row === right.row && left.column === right.column;
  }

  render(): void {
    for (const row of this.cells) {
      for (const cell of row) {
        this.environment.disposeContent(cell);
      }
    }
    this.table.replaceChildren();
    this.cells = [];
    this.model.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      const elements: HTMLElement[] = [];
      row.forEach((_cell, column) => {
        const td = document.createElement(rowIndex === 0 ? "th" : "td");
        td.dataset.row = String(rowIndex);
        td.dataset.column = String(column);
        td.setAttribute(
          "aria-label",
          `Row ${rowIndex + 1}, column ${column + 1}`,
        );
        elements.push(td);
        tr.append(td);
      });
      this.cells.push(elements);
      this.table.append(tr);
      elements.forEach((_td, column) =>
        this.display({ row: rowIndex, column }),
      );
    });
  }

  display(position: CellPosition): void {
    const cell = this.model.rows[position.row]?.[position.column];
    const element = this.cells[position.row]?.[position.column];
    if (!cell || !element) {
      return;
    }
    this.environment.disposeContent(element);
    element.style.textAlign = this.model.alignments[position.column] ?? "left";
    this.environment.renderContent(
      element,
      cell.text,
      this.block.from + cell.from,
    );
  }

  open = open;

  close = close;

  hostAction = hostAction;

  selection = selection;

  move = move;

  arrow = arrow;

  leave = leave;

  selectAxis = selectAxis;

  position = position;

  pointerDown = pointerDown;

  highlight = highlight;

  copy = copy;

  paste = paste;

  pasteText = pasteText;

  contextMenu = contextMenu;

  showMenu = showMenu;

  menuActions = menuActions;

  /** Copy the text selected in the open cell, else the selected cells. */
  copyFromMenu = copyFromMenu;

  /**
   * Reading the clipboard is asynchronous. Refuse to paste if the table or
   * the selection changed while it was read.
   */
  pasteFromMenu = pasteFromMenu;

  execute = execute;

  clearCells = clearCells;

  formatCells = formatCells;

  report = report;

  replace = replace;

  destroy(): void {
    this.selectionDrag.destroy();
    this.handles.destroy();
    this.closeMenu?.();
    this.events.abort();
    if (activeTables.get(this.outer) === this) {
      activeTables.delete(this.outer);
    }
    this.cellEditor?.destroy();
    for (const row of this.cells) {
      for (const cell of row) {
        this.environment.disposeContent(cell);
      }
    }
  }
}
