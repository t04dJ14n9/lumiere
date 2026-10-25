import {
  insertColumn,
  insertRow,
  rectangle,
  type CellPosition,
  type CellRange,
} from "../../markdown/tables/model";
import type { Axis, TableOperation } from "../../markdown/tables/operations";
import {
  CLICK_DRAG_PX,
  latchClickDrag,
  type ClickToEditPress,
} from "../../webview/ui/block-pointer";
import { tableMenu, type TableMenuActions } from "./menu";
import type { TableGrid } from "./grid";
import type { TableClipboard } from "./clipboard";
import type { TableEnvironment } from "./environment";

interface MenuSelection {
  range(): CellRange | undefined;
  active(): CellPosition | undefined;
  open(position: CellPosition): void;
  request(position: CellPosition): void;
  execute(operation: TableOperation, focus: CellPosition): void;
  selectAll(): void;
}

/** Toolbar and contextual menu lifetime, independent of cell-editor internals. */
export class TableToolbar {
  private closeMenu?: () => void;
  constructor(
    private readonly grid: TableGrid,
    private readonly selection: MenuSelection,
    private readonly clipboard: TableClipboard,
    private readonly openMenu: TableEnvironment["openMenu"],
  ) {}

  controls(): HTMLElement {
    const controls = document.createElement("div");
    controls.className = "table-controls";
    this.bindAddStrip(controls, "Add row below", "row", () => {
      this.selection.request({ row: this.grid.model.rows.length, column: 0 });
      this.grid.replace(
        insertRow(this.grid.model, this.grid.model.rows.length - 1),
      );
    });
    this.bindAddStrip(controls, "Add column to the right", "column", () => {
      // Measured in Obsidian 1.14.4: the caret lands in the new header cell,
      // whichever row it was in.
      this.selection.request({
        row: 0,
        column: this.grid.model.alignments.length,
      });
      this.grid.replace(
        insertColumn(this.grid.model, this.grid.model.alignments.length - 1),
      );
    });
    return controls;
  }

  /**
   * Wire one add-row / add-column strip. Horizontal pans on the row strip
   * (same edge as `.table-scroll`'s scrollbar — BH-019) must not fire
   * insertRow / serializeTable padding; they scroll the table instead.
   * A true click (no drag past {@link CLICK_DRAG_PX}) still inserts.
   */
  private bindAddStrip(
    controls: HTMLElement,
    label: string,
    axis: Axis,
    run: () => void,
  ): void {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = "+";
    action.className = axis === "row" ? "table-row-btn" : "table-col-btn";
    action.setAttribute("aria-label", label);
    action.title = label;
    let press: ClickToEditPress | null = null;
    let lastX = 0;
    action.addEventListener("pointerdown", (event) => {
      // Keep the focus in the cell until the new one opens.
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      press = { x: event.clientX, y: event.clientY, dragged: false };
      lastX = event.clientX;
      action.setPointerCapture(event.pointerId);
    });
    action.addEventListener("pointermove", (event) => {
      if (!press || !action.hasPointerCapture(event.pointerId)) {
        return;
      }
      latchClickDrag(press, event.clientX, event.clientY, CLICK_DRAG_PX);
      if (axis === "row" && press.dragged) {
        this.grid.scroll.scrollLeft += event.clientX - lastX;
        lastX = event.clientX;
      }
    });
    action.addEventListener("click", () => {
      const dragged = press?.dragged === true;
      press = null;
      if (
        !addStripClickCommits({
          dragged,
          opacity: getComputedStyle(action).opacity,
          focusVisible: action.matches(":focus-visible"),
        })
      ) {
        return;
      }
      run();
    });
    controls.append(action);
  }

  contextMenu(event: MouseEvent): void {
    const position = this.grid.position(event.target);
    if (!position) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.showMenu(position, { x: event.clientX, y: event.clientY });
  }

  showMenu(
    position: CellPosition,
    point: { x: number; y: number },
    axis?: Axis,
  ): void {
    this.close();
    const range = this.selection.range();
    if (!containsCell(range, position)) {
      this.selection.open(position);
    }
    const selected = this.selection.range() ?? {
      anchor: { ...position },
      head: { ...position },
    };
    this.closeMenu = this.openMenu(
      this.grid.root,
      tableMenu(this.grid.model, selected, this.menuActions(selected), axis),
      point,
      (message) => this.report(message),
    );
  }

  private menuActions(range: CellRange): TableMenuActions {
    return {
      copy: (cut) => this.clipboard.copyFromMenu(range, cut),
      paste: () => this.clipboard.pasteFromMenu(range),
      selectAll: () => this.selection.selectAll(),
      canFormat: this.clipboard.canFormat,
      format: (marker) => this.clipboard.formatCells(range, marker),
      clear: () => this.clipboard.clearCells(range),
      execute: (operation, focus) => this.selection.execute(operation, focus),
    };
  }

  private report(message: string): void {
    let notice = this.grid.root.querySelector<HTMLElement>(".table-message");
    if (!notice) {
      notice = document.createElement("p");
      notice.className = "table-message";
      notice.setAttribute("role", "alert");
      this.grid.root.append(notice);
    }
    notice.textContent = message;
  }

  close(): void {
    this.closeMenu?.();
    delete this.closeMenu;
  }
}

/**
 * Whether an add-strip click should insert. Drag past the click threshold
 * (horizontal pan on the bottom edge — BH-019) never inserts; invisible
 * strips still refuse accidental edge presses.
 */
export function addStripClickCommits(input: {
  dragged: boolean;
  opacity: string;
  focusVisible: boolean;
}): boolean {
  if (input.dragged) {
    return false;
  }
  return input.opacity === "1" || input.focusVisible;
}

export function containsCell(
  range: CellRange | undefined,
  position: CellPosition,
): boolean {
  if (!range) {
    return false;
  }
  const area = rectangle(range);
  return (
    position.row >= area.top &&
    position.row <= area.bottom &&
    position.column >= area.left &&
    position.column <= area.right
  );
}
