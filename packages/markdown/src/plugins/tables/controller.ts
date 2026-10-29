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
import { ColumnResize } from "./column-resize";
import { sourceAfterOperation, splitTableSource } from "./column-widths";
import { activeTables, tableSelectionChanges } from "./state";
import { TableStickyHScroll } from "./sticky-hscroll";
import { bindTableFocus } from "./focus-lifetime";
import { followDiagonalWheel } from "./diagonal-wheel";

/** Wires table interactions and reconciles snapshots from the outer document. */
export class TableController {
  private readonly grid: TableGrid;
  private readonly projection: CellProjection;
  private selected!: TableSelection;
  private keyboard!: TableKeyboard;
  private clipboard!: TableClipboard;
  private toolbar!: TableToolbar;
  private readonly handles: TableHandles;
  private readonly columnResize: ColumnResize;
  private readonly sticky: TableStickyHScroll;
  private readonly events = new AbortController();
  private requested?: CellPosition | undefined;

  constructor(
    root: HTMLElement,
    outer: EditorView,
    block: RenderBlock,
    environment: TableEnvironment,
  ) {
    this.grid = new TableGrid(root, outer, block, environment);
    this.projection = this.createProjection(environment);
    const wired = this.wireCollaborators(environment);
    this.selected = wired.selected;
    this.clipboard = wired.clipboard;
    this.toolbar = wired.toolbar;
    this.keyboard = wired.keyboard;
    this.registerEvents();
    followDiagonalWheel(
      this.grid.scroll,
      () => this.grid.outer.scrollDOM,
      this.events.signal,
    );
    bindTableFocus({
      root,
      contentDOM: outer.contentDOM,
      signal: this.events.signal,
      clear: () => this.clearActiveTable(),
    });
    this.grid.wrapper.append(this.toolbar.controls());
    this.grid.render();
    this.handles = this.createHandles();
    this.handles.refresh();
    this.columnResize = new ColumnResize(
      this.grid.root,
      this.grid.table,
      (widths) => this.grid.replaceTable(this.grid.tableSource(), widths),
    );
    this.columnResize.refresh();
    this.columnResize.applyWidths(this.grid.widths);
    this.sticky = new TableStickyHScroll(this.grid.scroll, outer.scrollDOM);
  }

  private wireCollaborators(environment: TableEnvironment) {
    const selected = new TableSelection(
      this.grid,
      this.projection,
      {
        activate: () => activeTables.set(this.grid.outer, this),
        setHandle: (position) => this.handles.setActive(position),
      },
      environment.position,
    );
    const clipboard = new TableClipboard(
      this.grid,
      this.projection,
      selected,
      environment,
    );
    const request = (position: CellPosition) =>
      void (this.requested = position);
    const toolbar = new TableToolbar(
      this.grid,
      {
        range: () => this.selected.range,
        active: () => this.projection.active,
        open: (position) => this.projection.open(position),
        request,
        execute: (operation, focus) => this.execute(operation, focus),
        selectAll: () => this.selected.selectAll(),
      },
      clipboard,
      environment.openMenu,
    );
    const keyboard = new TableKeyboard(this.grid, this.projection, selected, {
      request,
      deactivate: () => activeTables.delete(this.grid.outer),
      menu: (position, point) => this.toolbar.showMenu(position, point),
    });
    return { selected, clipboard, toolbar, keyboard };
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
    this.selected.range = range;
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
          root.isConnected &&
          event.target instanceof Node &&
          !root.contains(event.target)
        ) {
          this.clearActiveTable();
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

  private createHandles(): TableHandles {
    return new TableHandles(
      this.grid.root,
      this.grid.table,
      {
        vertical: this.grid.outer.scrollDOM,
        horizontal: this.grid.scroll,
      },
      {
        select: (axis, index) => this.selected.selectAxis(axis, index),
        move: (axis, from, to) => {
          const op: TableOperation = {
            type: "move",
            axis,
            from,
            to: from,
            destination: to,
          };
          this.grid.replace(
            sourceAfterOperation(
              operateTable(this.grid.model, op),
              this.grid.widths,
              op,
            ),
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

  update(block: RenderBlock, outer: EditorView, force = false): void {
    if (this.canSkipUpdate(block, outer, force)) {
      this.grid.block = block;
      return;
    }
    const activeEl = this.grid.root.ownerDocument.activeElement;
    const keepFocus = Boolean(
      this.editor?.hasFocus || this.editor?.dom.contains(activeEl),
    );
    if (block.source !== this.grid.block.source) {
      this.handles.cancel();
      this.selected.drag.cancel();
      this.toolbar.close();
    }
    this.grid.outer = outer;
    const split = splitTableSource(block.source);
    const model = parseTable(split.table);
    if (!model) {
      return;
    }
    const previousModel = this.grid.model;
    const shapeChanged =
      model.rows.length !== previousModel.rows.length ||
      model.alignments.length !== previousModel.alignments.length;
    const moved = shapeChanged
      ? this.relocatedCell(model, split.table)
      : undefined;
    this.grid.block = block;
    this.grid.model = model;
    this.grid.widths = split.widths;
    this.refreshCells(shapeChanged, moved, previousModel, force);
    this.projection.update();
    if (this.requested) {
      const next = this.requested;
      delete this.requested;
      this.projection.open(next, "all");
    } else if (keepFocus) {
      this.projection.retainFocus();
    }
    this.highlight();
    this.handles.refresh();
    this.columnResize.refresh();
    this.columnResize.applyWidths(this.grid.widths);
  }

  private canSkipUpdate(b: RenderBlock, outer: EditorView, force: boolean) {
    return (
      !force &&
      b.source === this.grid.block.source &&
      outer === this.grid.outer &&
      !this.requested &&
      !b.source.includes("[^") &&
      !b.source.includes("^[")
    );
  }

  private relocatedCell(
    model: typeof this.grid.model,
    next: string,
  ): CellPosition | undefined {
    if (!this.active || this.requested) {
      return undefined;
    }
    const prev = this.grid.model.rows[this.active.row]![this.active.column]!;
    const mapped = difference(this.grid.block.source, next).mapPos(
      prev.from,
      1,
    );
    return (
      cellAtOffset(model, mapped) ??
      (this.editor
        ? {
            row: Math.min(this.active.row, model.rows.length - 1),
            column: Math.min(this.active.column, model.alignments.length - 1),
          }
        : undefined)
    );
  }

  private refreshCells(
    shapeChanged: boolean,
    moved: CellPosition | undefined,
    previousModel: typeof this.grid.model,
    force: boolean,
  ): void {
    if (!shapeChanged) {
      this.grid.refresh(this.active, previousModel, force);
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

  private clearActiveTable(notify = true): void {
    if (activeTables.get(this.grid.outer) === this) {
      activeTables.delete(this.grid.outer);
      this.close();
      delete this.selected.range;
      this.highlight();
      if (notify) {
        this.grid.outer.state.facet(tableSelectionChanges)(false);
      }
    }
  }

  suspend(releaseActive = false): void {
    this.handles.cancel();
    this.selected.drag.cancel();
    this.toolbar.close();
    // The active table's cell editor stays alive while CodeMirror unmounts
    // the widget past the viewport, so scrolling does not rebuild cell
    // Markdown on the way by. Real teardown passes releaseActive.
    if (!releaseActive && activeTables.get(this.grid.outer) === this) {
      return;
    }
    this.grid.root.classList.remove("has-focus");
    delete this.requested;
    this.close();
    delete this.selected.range;
    this.highlight();
    this.clearActiveTable(false);
  }

  execute(operation: TableOperation, focus: CellPosition): void {
    const table = operateTable(this.grid.model, operation);
    const source = sourceAfterOperation(table, this.grid.widths, operation);
    if (source === this.grid.block.source) {
      (this.editor ?? this.grid.outer).focus();
      return;
    }
    const next = parseTable(table);
    this.close();
    delete this.selected.range;
    this.requested = next
      ? {
          row: Math.max(0, Math.min(focus.row, next.rows.length - 1)),
          column: Math.max(
            0,
            Math.min(focus.column, next.alignments.length - 1),
          ),
        }
      : undefined;
    this.grid.replace(source);
    if (!next) {
      this.grid.outer.focus();
    }
  }

  destroy(): void {
    this.suspend(true);
    this.selected.drag.destroy();
    this.handles.destroy();
    this.columnResize.destroy();
    this.sticky.destroy();
    this.events.abort();
    this.projection.cellEditor?.destroy();
    this.grid.disposeContent();
  }
}
