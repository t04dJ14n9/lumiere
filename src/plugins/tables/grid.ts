import type { EditorView } from "@codemirror/view";
import {
  parseTable,
  type CellPosition,
  type Table,
} from "../../markdown/tables/model";
import { editGroup } from "../document/api";
import type { RenderBlock } from "../livePreview/api";
import type { TableEnvironment } from "./environment";

/** Rendered cells and their current source snapshot. It owns no selection. */
export class TableGrid {
  readonly table = document.createElement("table");
  readonly wrapper = document.createElement("div");
  cells: HTMLElement[][] = [];
  model: Table;
  private operationSequence = 0;

  constructor(
    readonly root: HTMLElement,
    public outer: EditorView,
    public block: RenderBlock,
    private readonly content: Pick<
      TableEnvironment,
      "disposeContent" | "renderContent"
    >,
  ) {
    this.model = parseTable(block.source)!;
    this.table.className = "markdown-rendered table-editor";
    this.table.setAttribute("aria-label", "Markdown table");
    // A wide table scrolls by itself, as in Obsidian, not the whole note.
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    this.wrapper.className = "table-wrapper";
    this.wrapper.append(this.table);
    scroll.append(this.wrapper);
    root.append(scroll);
  }

  start(): number {
    return this.outer.posAtDOM(this.root);
  }

  commandGroup(): string {
    return `table-command-${++this.operationSequence}`;
  }

  replace(source: string): void {
    if (source === this.block.source) {
      return;
    }
    const from = this.start();
    this.outer.dispatch({
      changes: { from, to: from + this.block.source.length, insert: source },
      annotations: editGroup.of(this.commandGroup()),
    });
  }

  render(): void {
    this.disposeContent();
    this.table.replaceChildren();
    this.cells = [];
    const header = this.table.createTHead();
    const body = this.table.createTBody();
    this.model.rows.forEach((row, rowIndex) => {
      const element = document.createElement("tr");
      const cells = row.map((_cell, column) => {
        const cell = document.createElement(rowIndex === 0 ? "th" : "td");
        cell.dataset.row = String(rowIndex);
        cell.dataset.column = String(column);
        cell.setAttribute(
          "aria-label",
          `Row ${rowIndex + 1}, column ${column + 1}`,
        );
        const wrapper = document.createElement("div");
        wrapper.className = "table-cell-wrapper";
        const content = document.createElement("div");
        content.className = "table-cell-content";
        wrapper.append(content);
        cell.append(wrapper);
        element.append(cell);
        return cell;
      });
      this.cells.push(cells);
      (rowIndex === 0 ? header : body).append(element);
      cells.forEach((_cell, column) => this.display({ row: rowIndex, column }));
    });
  }

  refresh(active?: CellPosition): void {
    this.cells.forEach((row, rowIndex) =>
      row.forEach((_cell, column) => {
        const position = { row: rowIndex, column };
        this.align(position);
        if (!sameCell(active, position)) {
          this.display(position);
        }
      }),
    );
  }

  display(position: CellPosition): void {
    const cell = this.model.rows[position.row]?.[position.column];
    const element = this.contentElement(position);
    if (!cell || !element) {
      return;
    }
    this.content.disposeContent(element);
    this.align(position);
    this.content.renderContent(element, cell.text, this.block.from + cell.from);
  }

  disposeContent(): void {
    for (const cell of this.table.querySelectorAll<HTMLElement>(
      ".table-cell-content",
    )) {
      this.content.disposeContent(cell);
    }
  }

  contentElement(position: CellPosition): HTMLElement | undefined {
    return (
      this.cells[position.row]?.[position.column]?.querySelector<HTMLElement>(
        ".table-cell-content",
      ) ?? undefined
    );
  }

  private align(position: CellPosition): void {
    const cell = this.cells[position.row]?.[position.column];
    if (cell) {
      const alignment = this.model.alignments[position.column] ?? "left";
      cell.style.textAlign = alignment;
      cell.setAttribute("align", alignment);
    }
  }

  position(target: EventTarget | null): CellPosition | undefined {
    const cell =
      target instanceof Element
        ? target.closest<HTMLElement>("td[data-row], th[data-row]")
        : null;
    if (!cell || !this.table.contains(cell)) {
      return undefined;
    }
    return {
      row: Number(cell.dataset.row),
      column: Number(cell.dataset.column),
    };
  }
}

export function sameCell(
  left: CellPosition | undefined,
  right: CellPosition,
): boolean {
  return left?.row === right.row && left.column === right.column;
}
