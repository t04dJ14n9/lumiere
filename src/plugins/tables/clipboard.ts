import {
  copyCells,
  pastedCells,
  rangeTexts,
  toggleMarker,
  writeCells,
  type CellRange,
} from "../../markdown/tables/model";

import type { TableGrid } from "./grid";
import type { CellProjection } from "./projection";
import type { TableSelection } from "./selection";
import type { TableEnvironment } from "./environment";

/** Clipboard and formatting operations over cell text or a rectangular range. */
export class TableClipboard {
  constructor(
    private readonly grid: TableGrid,
    private readonly projection: CellProjection,
    private readonly selection: TableSelection,
    private readonly environment: Pick<
      TableEnvironment,
      "copy" | "paste" | "wrap" | "clearFormatting"
    >,
  ) {}
  copy(event: ClipboardEvent, cut: boolean): void {
    if (!this.selection.range || !event.clipboardData) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      copyCells(this.grid.model, this.selection.range),
    );
    if (cut) {
      this.grid.replace(
        writeCells(this.grid.model, this.selection.range, [[""]]),
      );
    }
  }

  paste(event: ClipboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    const range =
      this.selection.range ??
      (this.projection.active && {
        anchor: this.projection.active,
        head: this.projection.active,
      });
    if (
      text === undefined ||
      !range ||
      (!this.selection.range && !/[\t\r\n]/.test(text))
    ) {
      return;
    }
    event.preventDefault();
    this.pasteText(text, range);
  }

  pasteText(text: string, range: CellRange): void {
    if (text) {
      this.grid.replace(writeCells(this.grid.model, range, pastedCells(text)));
    }
  }

  copyFromMenu(range: CellRange, cut: boolean): void {
    const context = this.environment;
    const inner = this.projection.inner;
    const selection = inner?.state.selection.main;
    if (!this.selection.range && inner && selection && !selection.empty) {
      context.copy(inner.state.sliceDoc(selection.from, selection.to));
      if (cut) {
        inner.dispatch(inner.state.replaceSelection(""));
      }
      inner.focus();
      return;
    }
    context.copy(copyCells(this.grid.model, range));
    if (cut) {
      this.clearCells(range);
    } else {
      (this.projection.inner ?? this.grid.outer).focus();
    }
  }

  async pasteFromMenu(range: CellRange): Promise<void> {
    const expected = this.grid.block.source;
    const editor = this.projection.inner;
    const selection = editor?.state.selection;
    const grid = this.selection.range;
    const context = this.environment;
    if (!context.paste) {
      throw new Error("Use the keyboard paste shortcut in this view.");
    }
    const text = await context.paste();
    if (!this.grid.root.isConnected) {
      return;
    }
    if (
      expected !== this.grid.block.source ||
      editor !== this.projection.inner ||
      grid !== this.selection.range ||
      (selection && !selection.eq(editor.state.selection))
    ) {
      throw new Error(
        "The table or selection changed before paste completed. Paste again.",
      );
    }
    if (
      this.projection.inner &&
      !this.selection.range &&
      !/[\t\r\n]/.test(text)
    ) {
      this.projection.inner.dispatch(
        this.projection.inner.state.replaceSelection(text),
      );
      this.projection.inner.focus();
    } else {
      this.projection.close();
      this.selection.range = range;
      this.pasteText(text, range);
      this.selection.highlight();
      this.grid.root.focus();
    }
  }

  clearCells(range: CellRange): void {
    this.selection.activate(range);
    this.grid.replace(writeCells(this.grid.model, range, [[""]]));
    this.selection.highlight();
    this.grid.root.focus();
  }

  formatCells(range: CellRange, marker: string | null): void {
    if (this.projection.inner && !this.selection.range) {
      const editor = this.projection.inner;
      if (editor.state.selection.main.empty) {
        editor.dispatch({
          selection: { anchor: 0, head: editor.state.doc.length },
        });
      }
      if (marker) {
        this.environment.wrap(marker, editor);
      } else {
        const selected = editor.state.selection.main;
        editor.dispatch(
          editor.state.replaceSelection(
            this.environment.clearFormatting(
              editor.state.sliceDoc(selected.from, selected.to),
            ),
          ),
        );
      }
      editor.focus();
      return;
    }
    const values = rangeTexts(this.grid.model, range).map((row) =>
      row.map((text) =>
        marker === null
          ? this.environment.clearFormatting(text)
          : toggleMarker(text, marker),
      ),
    );
    this.grid.replace(writeCells(this.grid.model, range, values));
    this.grid.root.focus();
  }
}
