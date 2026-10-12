import type { EditorView } from "@codemirror/view";
import {
  cellAtOffset,
  cellForSourceOffset,
  parseTable,
  type CellPosition,
  type CellRange,
} from "../../markdown/tables/model";
import {
  operateTable,
  type TableOperation,
} from "../../markdown/tables/operations";
import { difference } from "../../shared/document/wire";
import type { RenderBlock } from "../livePreview/api";
import type { TableEnvironment } from "./environment";
import { TableGrid } from "./grid";
import { CellProjection } from "./projection";
import { TableSelection } from "./selection";
import { TableKeyboard } from "./keyboard";
import { TableClipboard } from "./clipboard";
import { TableToolbar } from "./toolbar";
import { TableHandles } from "./handles";
import { activeTables, tableSelectionChanges } from "./state";

/** Wires table interactions and reconciles snapshots from the outer document. */
export class TableController {
  private readonly grid: TableGrid;
  private readonly projection: CellProjection;
  private readonly selected: TableSelection;
  private readonly keyboard: TableKeyboard;
  private readonly clipboard: TableClipboard;
  private readonly toolbar: TableToolbar;
  private readonly handles: TableHandles;
  private readonly events = new AbortController();
  private requested?: CellPosition;

  constructor(
    root: HTMLElement,
    outer: EditorView,
    block: RenderBlock,
    environment: TableEnvironment,
  ) {
    this.grid = new TableGrid(root, outer, block, environment);
    this.projection = this.createProjection(environment);
    this.selected = new TableSelection(
      this.grid,
      this.projection,
      {
        activate: () => activeTables.set(this.grid.outer, this),
        setHandle: (position) => this.handles.setActive(position),
      },
      environment.position,
    );
    this.clipboard = new TableClipboard(
      this.grid,
      this.projection,
      this.selected,
      environment,
    );
    this.toolbar = new TableToolbar(
      this.grid,
      {
        range: () => this.selected.range,
        active: () => this.projection.active,
        open: (position) => this.projection.open(position),
        request: (position) => {
          this.requested = position;
        },
        execute: (operation, focus) => this.execute(operation, focus),
        selectAll: () => this.selected.selectAll(),
      },
      this.clipboard,
      environment.openMenu,
    );
    this.keyboard = new TableKeyboard(
      this.grid,
      this.projection,
      this.selected,
      {
        request: (position) => {
          this.requested = position;
        },
        deactivate: () => activeTables.delete(this.grid.outer),
        menu: (position, point) => this.toolbar.showMenu(position, point),
      },
    );
    this.registerEvents();
    this.registerFocus();
    this.grid.wrapper.append(this.toolbar.controls());
    this.grid.render();
    this.handles = this.createHandles();
    this.handles.refresh();
  }

  private createProjection(environment: TableEnvironment): CellProjection {
    return new CellProjection(this.grid, environment, {
      activate: (position) => {
        delete this.selected.range;
        this.handles.setActive(position);
        activeTables.set(this.grid.outer, this);
      },
      highlight: () => this.selected.highlight(),
      move: (row, column) => this.keyboard.move(row, column),
      arrow: (step, extend) => this.keyboard.arrow(step, extend),
    });
  }

  get editor(): EditorView | undefined {
    return this.projection.inner;
  }
  get active(): CellPosition | undefined {
    return this.projection.active;
  }
  get range(): CellRange | undefined {
    return this.selected.range;
  }
  set range(range: CellRange | undefined) {
    if (range) {
      this.selected.range = range;
    } else {
      delete this.selected.range;
    }
  }
  close(): void {
    this.projection.close();
  }

  bounds(): { from: number; to: number } {
    const from = this.grid.start();
    return { from, to: from + this.grid.block.source.length };
  }

  enter(direction: -1 | 1): void {
    this.keyboard.enter(direction);
  }
  enterSourcePosition(head: number): boolean {
    if (this.active || this.range || !this.grid.root.isConnected) {
      return false;
    }
    const target = cellForSourceOffset(
      this.grid.model,
      head - this.grid.start(),
    );
    if (!target) {
      return false;
    }
    this.projection.open(target.position, target.offset);
    return true;
  }
  highlight(): void {
    this.selected.highlight();
  }
  selection(): { from: number; to: number } | undefined {
    return this.selected.sourceRange();
  }

  private registerEvents(): void {
    const { root, outer } = this.grid;
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
          delete this.selected.range;
          this.highlight();
          outer.state.facet(tableSelectionChanges)(false);
        }
      },
      { capture: true, signal: this.events.signal },
    );
    root.addEventListener("pointerdown", (event) =>
      this.selected.pointerDown(event),
    );
    root.addEventListener("copy", (event) => this.clipboard.copy(event, false));
    root.addEventListener("cut", (event) => this.clipboard.copy(event, true));
    root.addEventListener("paste", (event) => this.clipboard.paste(event));
    root.addEventListener("contextmenu", (event) =>
      this.toolbar.contextMenu(event),
    );
    root.addEventListener(
      "keydown",
      (event) => {
        this.clipboard.keyDown(event);
        this.keyboard.keyDown(event);
      },
      { signal: this.events.signal },
    );
  }

  private registerFocus(): void {
    const root = this.grid.root;
    root.addEventListener("focusin", () => root.classList.add("has-focus"), {
      signal: this.events.signal,
    });
    root.addEventListener(
      "focusout",
      () => {
        // Menu invocation removes its DOM before queuing the command. Give
        // that command a turn to restore cell focus before closing the editor.
        queueMicrotask(() =>
          queueMicrotask(() => {
            if (root.contains(document.activeElement)) {
              return;
            }
            root.classList.remove("has-focus");
            if (activeTables.get(this.grid.outer) === this) {
              activeTables.delete(this.grid.outer);
              this.close();
              delete this.selected.range;
              this.highlight();
              this.grid.outer.state.facet(tableSelectionChanges)(false);
            }
          }),
        );
      },
      { signal: this.events.signal },
    );
  }

  private createHandles(): TableHandles {
    return new TableHandles(
      this.grid.root,
      this.grid.table,
      this.grid.outer.scrollDOM,
      {
        select: (axis, index) => this.selected.selectAxis(axis, index),
        move: (axis, from, to) => {
          this.grid.replace(
            operateTable(this.grid.model, {
              type: "move",
              axis,
              from,
              to: from,
              destination: to,
            }),
          );
          this.selected.selectAxis(axis, to);
        },
        menu: (axis, index, point) => {
          this.selected.selectAxis(axis, index, false);
          this.toolbar.showMenu(this.selected.range!.head, point, axis);
        },
      },
    );
  }

  update(block: RenderBlock, outer: EditorView): void {
    if (block.source !== this.grid.block.source) {
      this.handles.cancel();
      this.selected.drag.cancel();
      this.toolbar.close();
    }
    this.grid.outer = outer;
    const model = parseTable(block.source);
    if (!model) {
      return;
    }
    const shapeChanged =
      model.rows.length !== this.grid.model.rows.length ||
      model.alignments.length !== this.grid.model.alignments.length;
    let moved: CellPosition | undefined;
    if (shapeChanged && this.active && !this.requested) {
      const previous =
        this.grid.model.rows[this.active.row]![this.active.column]!;
      // When the cell itself is gone (undo removed its row or column), the
      // caret stays in the table, in the nearest remaining cell.
      moved =
        cellAtOffset(
          model,
          difference(this.grid.block.source, block.source).mapPos(
            previous.from,
            1,
          ),
        ) ??
        (this.editor
          ? {
              row: Math.min(this.active.row, model.rows.length - 1),
              column: Math.min(this.active.column, model.alignments.length - 1),
            }
          : undefined);
    }
    this.grid.block = block;
    this.grid.model = model;
    this.refreshCells(shapeChanged, moved);
    this.projection.update();
    if (this.requested) {
      const next = this.requested;
      delete this.requested;
      this.projection.open(next, "all");
    }
    this.highlight();
    this.handles.refresh();
  }

  private refreshCells(shapeChanged: boolean, moved?: CellPosition): void {
    if (!shapeChanged) {
      this.grid.refresh(this.active);
      return;
    }
    delete this.selected.range;
    if (moved && this.editor && this.active) {
      this.projection.relocate(moved);
    } else {
      this.close();
      this.grid.render();
    }
  }

  execute(operation: TableOperation, focus: CellPosition): void {
    const source = operateTable(this.grid.model, operation);
    if (source === this.grid.block.source) {
      (this.editor ?? this.grid.outer).focus();
      return;
    }
    const next = parseTable(source);
    this.close();
    delete this.selected.range;
    if (next) {
      this.requested = {
        row: Math.max(0, Math.min(focus.row, next.rows.length - 1)),
        column: Math.max(0, Math.min(focus.column, next.alignments.length - 1)),
      };
    } else {
      delete this.requested;
    }
    this.grid.replace(source);
    if (!next) {
      this.grid.outer.focus();
    }
  }

  destroy(): void {
    this.selected.drag.destroy();
    this.handles.destroy();
    this.toolbar.close();
    this.events.abort();
    if (activeTables.get(this.grid.outer) === this) {
      activeTables.delete(this.grid.outer);
    }
    this.projection.cellEditor?.destroy();
    this.grid.disposeContent();
  }
}
