import {
  copyCells,
  pastedCells,
  rangeTexts,
  toggleMarker,
  writeCells,
  type CellRange,
} from "../../markdown/tables/model";

import { activeTables } from "./state";

import type { TableController } from "./controller";
export function copy(
  this: TableController,
  event: ClipboardEvent,
  cut: boolean,
): void {
  if (!this.range || !event.clipboardData) {
    return;
  }
  event.preventDefault();
  event.clipboardData.setData("text/plain", copyCells(this.model, this.range));
  if (cut) {
    this.replace(writeCells(this.model, this.range, [[""]]));
  }
}

export function paste(this: TableController, event: ClipboardEvent): void {
  const text = event.clipboardData?.getData("text/plain");
  const range =
    this.range ?? (this.active && { anchor: this.active, head: this.active });
  if (text === undefined || !range || (!this.range && !/[\t\r\n]/.test(text))) {
    return;
  }
  event.preventDefault();
  this.pasteText(text, range);
}

export function pasteText(
  this: TableController,
  text: string,
  range: CellRange,
): void {
  if (text) {
    this.replace(writeCells(this.model, range, pastedCells(text)));
  }
}

export function copyFromMenu(
  this: TableController,
  range: CellRange,
  cut: boolean,
): void {
  const context = this.environment;
  const inner = this.inner;
  const selection = inner?.state.selection.main;
  if (!this.range && inner && selection && !selection.empty) {
    context.copy(inner.state.sliceDoc(selection.from, selection.to));
    if (cut) {
      inner.dispatch(inner.state.replaceSelection(""));
    }
    inner.focus();
    return;
  }
  context.copy(copyCells(this.model, range));
  if (cut) {
    this.clearCells(range);
  } else {
    (this.inner ?? this.outer).focus();
  }
}

export async function pasteFromMenu(
  this: TableController,
  range: CellRange,
): Promise<void> {
  const expected = this.block.source;
  const editor = this.inner;
  const selection = editor?.state.selection;
  const grid = this.range;
  const context = this.environment;
  if (!context.paste) {
    throw new Error("Use the keyboard paste shortcut in this view.");
  }
  const text = await context.paste();
  if (!this.root.isConnected) {
    return;
  }
  if (
    expected !== this.block.source ||
    editor !== this.inner ||
    grid !== this.range ||
    (selection && !selection.eq(editor.state.selection))
  ) {
    throw new Error(
      "The table or selection changed before paste completed. Paste again.",
    );
  }
  if (this.inner && !this.range && !/[\t\r\n]/.test(text)) {
    this.inner.dispatch(this.inner.state.replaceSelection(text));
    this.inner.focus();
  } else {
    this.close();
    this.range = range;
    this.pasteText(text, range);
    this.highlight();
    this.root.focus();
  }
}

export function clearCells(this: TableController, range: CellRange): void {
  this.close();
  this.range = range;
  activeTables.set(this.outer, this);
  this.replace(writeCells(this.model, range, [[""]]));
  this.highlight();
  this.root.focus();
}

export function formatCells(
  this: TableController,
  range: CellRange,
  marker: string | null,
): void {
  if (this.inner && !this.range) {
    const editor = this.inner;
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
  const values = rangeTexts(this.model, range).map((row) =>
    row.map((text) =>
      marker === null
        ? this.environment.clearFormatting(text)
        : toggleMarker(text, marker),
    ),
  );
  this.replace(writeCells(this.model, range, values));
  this.root.focus();
}
