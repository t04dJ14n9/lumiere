import { EditorState } from "@codemirror/state";
import { cellText, type Cell } from "../../markdown/tables/model";
import { difference } from "../../shared/document/wire";

/** Keep table padding separate from whitespace entered during a cell session. */
export class CellSource {
  private leading: number;
  private trailing: number;
  private missing: boolean;

  constructor(cell: Cell) {
    this.leading = cell.from - cell.rawFrom;
    this.trailing = cell.rawTo - cell.to;
    this.missing = cell.missing ?? false;
  }

  materialize(): void {
    // materializeCell adds one padding space at either end of the new cell.
    this.leading = this.trailing = 1;
    this.missing = false;
  }

  range(source: string, cell: Cell): { from: number; to: number } {
    if (cell.missing || this.missing) {
      this.leading = cell.from - cell.rawFrom;
      this.trailing = cell.rawTo - cell.to;
      this.missing = cell.missing ?? false;
    }
    const from = Math.min(cell.rawTo, cell.rawFrom + this.leading);
    const to = Math.max(from, cell.rawTo - this.trailing);
    // An external edit may replace the padding as well as the content.
    if (
      source.slice(cell.rawFrom, from).trim() ||
      source.slice(to, cell.rawTo).trim()
    ) {
      this.leading = cell.from - cell.rawFrom;
      this.trailing = cell.rawTo - cell.to;
      return { from: cell.from, to: cell.to };
    }
    return { from, to };
  }
}

/** Cell editors use Markdown source offsets, including escaped pipes. */
export const cellSyntax = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged) {
    return transaction;
  }
  const text = transaction.newDoc.toString();
  const encoded = cellText(text);
  return encoded === text
    ? transaction
    : [transaction, { changes: difference(text, encoded), sequential: true }];
});
