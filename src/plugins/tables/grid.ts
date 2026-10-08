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
    this.table.className = "markdown-rendered";
    this.table.setAttribute("aria-label", "Markdown table");
    root.append(this.table);
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
        element.append(cell);
        return cell;
      });
      this.cells.push(cells);
      this.table.append(element);
      cells.forEach((_cell, column) => this.display({ row: rowIndex, column }));
    });
  }

  refresh(active?: CellPosition): void {
    this.cells.forEach((row, rowIndex) =>
      row.forEach((_cell, column) => {
        const position = { row: rowIndex, column };
        if (!sameCell(active, position)) {
          this.display(position);
        }
      }),
    );
  }

  display(position: CellPosition): void {
    const cell = this.model.rows[position.row]?.[position.column];
    const element = this.cells[position.row]?.[position.column];
    if (!cell || !element) {
      return;
    }
    this.content.disposeContent(element);
    element.style.textAlign = this.model.alignments[position.column] ?? "left";
    this.content.renderContent(element, cell.text, this.block.from + cell.from);
  }

  disposeContent(): void {
    for (const row of this.cells) {
      for (const cell of row) {
        this.content.disposeContent(cell);
      }
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
