import { EditorState } from "@codemirror/state";
import {
  cellPadding,
  cellText,
  type Cell,
  type Table,
} from "../../markdown/tables/model";
import { difference } from "../../shared/document/wire";

/** Keep table padding separate from whitespace entered during a cell session. */
export class CellSource {
  private text: string;

  constructor(cell: Cell) {
    this.text = cell.text;
  }

  remember(text: string): void {
    this.text = text;
  }

  range(
    source: string,
    cell: Cell,
    alignment: Table["alignments"][number] = null,
  ): { from: number; to: number } {
    if (cell.text !== this.text.trim() || cell.missing) {
      this.text = cell.text;
      return { from: cell.from, to: cell.to };
    }
    let from = cell.from - (this.text.length - this.text.trimStart().length);
    let to = cell.to + (this.text.length - this.text.trimEnd().length);
    if (!cell.text) {
      const width = Math.max(0, cell.rawTo - cell.rawFrom - 2);
      from = cell.rawFrom + 1 + cellPadding(this.text, width, alignment).before;
      to = from + this.text.length;
    }
    // External source edits can replace content or consume session whitespace.
    if (
      from < cell.rawFrom ||
      to > cell.rawTo ||
      source.slice(from, to) !== this.text
    ) {
      this.text = cell.text;
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
