import {
  copyCells,
  copyCellsHtml,
  copyCellsMarkdown,
  copyCellsObsidian,
  pastedCells,
  pastedMarkdownCells,
  rangeTexts,
  toggleMarker,
  writeCells,
  type CellPosition,
  type CellRange,
} from "../../markdown/tables/model";

import type { TableGrid } from "./grid";
import type { CellProjection } from "./projection";
import type { TableSelection } from "./selection";
import type { TableEnvironment } from "./environment";

interface CellSessionSnapshot {
  revision: number;
  active: Partial<CellPosition>;
}

function isCurrentCellSession(
  projection: Pick<CellProjection, "sessionRevision" | "active">,
  snapshot: CellSessionSnapshot,
): boolean {
  return (
    snapshot.revision === projection.sessionRevision &&
    snapshot.active.row === projection.active?.row &&
    snapshot.active.column === projection.active?.column
  );
}

/** Clipboard and formatting operations over cell text or a rectangular range. */
export class TableClipboard {
  constructor(
    private readonly grid: TableGrid,
    private readonly projection: CellProjection,
    private readonly selection: TableSelection,
    private readonly environment: Pick<
      TableEnvironment,
      "copy" | "paste" | "wrap" | "clearFormatting" | "canFormat"
    >,
  ) {}

  get canFormat(): boolean {
    return this.environment.canFormat;
  }
  keyDown(event: KeyboardEvent): void {
    const range = this.selection.range;
    if (
      !range ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.shiftKey ||
      !(event.metaKey || event.ctrlKey) ||
      event.key.toLowerCase() !== "c"
    ) {
      return;
    }
    // Grid selection focuses a non-editable element with no DOM text range.
    // Chromium may never emit copy there; the host also owns native clipboard
    // access in VS Code. Claim the key so forwarding cannot overwrite the TSV.
    event.preventDefault();
    event.stopPropagation();
    this.environment.copy(copyCells(this.grid.model, range));
  }

  copy(event: ClipboardEvent, cut: boolean): void {
    if (!this.selection.range || !event.clipboardData) {
      return;
    }
    event.preventDefault();
    const range = this.selection.range;
    const model = this.grid.model;
    // The four flavors Obsidian offers for a copied table: TSV as text/plain
    // for spreadsheets, Markdown and HTML for notes, and obsidian/table rows,
    // which a table paste reads back cell for cell.
    event.clipboardData.setData("text/plain", copyCells(model, range));
    event.clipboardData.setData(
      "text/markdown",
      copyCellsMarkdown(model, range),
    );
    event.clipboardData.setData("text/html", copyCellsHtml(model, range));
    event.clipboardData.setData(
      "obsidian/table",
      JSON.stringify(copyCellsObsidian(model, range)),
    );
    if (cut) {
      this.grid.replace(writeCells(model, range, [[""]]));
    }
  }

  paste(event: ClipboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    const data = event.clipboardData;
    const range =
      this.selection.range ??
      (this.projection.active && {
        anchor: this.projection.active,
        head: this.projection.active,
      });
    if (!data || !range) {
      return;
    }
    const structured = data.getData("obsidian/table");
    if (structured) {
      try {
        const payload = JSON.parse(structured) as { rows?: string[][] };
        if (Array.isArray(payload.rows) && payload.rows.length > 0) {
          event.preventDefault();
          this.grid.replace(writeCells(this.grid.model, range, payload.rows));
          return;
        }
      } catch {
        // Fall through to text flavors.
      }
    }
    const text =
      data.getData("text/plain") || data.getData("text/markdown") || "";
    if (!this.selection.range && !/[\t\r\n|]/.test(text)) {
      return;
    }
    event.preventDefault();
    this.pasteText(text, range);
  }

  pasteText(text: string, range: CellRange): void {
    if (!text) {
      return;
    }
    const cells = looksLikeMarkdownTable(text)
      ? pastedMarkdownCells(text)
      : pastedCells(text);
    this.grid.replace(writeCells(this.grid.model, range, cells));
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
    // Word navigation mutates the retained editor's position object in place.
    const session = {
      revision: this.projection.sessionRevision,
      active: { ...this.projection.active },
    };
    const selection = editor?.state.selection;
    const grid = this.selection.range;
    const context = this.environment;
    if (!context.paste) {
      throw new Error("Use the keyboard paste shortcut in this view.");
    }
    // Menus remove their focused DOM before awaiting clipboard RPC.
    // Restore focus now so blur cleanup does not close a still-valid editor.
    (editor ?? this.grid.root).focus();
    const text = await context.paste();
    if (!this.grid.root.isConnected) {
      return;
    }
    if (
      expected !== this.grid.block.source ||
      editor !== this.projection.inner ||
      !isCurrentCellSession(this.projection, session) ||
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

function looksLikeMarkdownTable(text: string): boolean {
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  return (
    lines.length >= 2 &&
    lines[0]!.includes("|") &&
    /^\s*\|?\s*:?-{3,}/.test(lines[1]!)
  );
}
