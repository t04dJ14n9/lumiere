import test from "node:test";
import assert from "node:assert/strict";
import {
  ChangeSet,
  EditorState,
  Text,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import { parseTable } from "../../markdown/tables/model";
import { CellEditor } from "./cell-editor";
import { CellSource } from "./cell-source";
import { TableClipboard } from "./clipboard";
import type { TableEnvironment } from "./environment";
import type { TableGrid } from "./grid";
import { CellProjection, projectedChanges } from "./projection";
import type { TableSelection } from "./selection";
import { installCellWordNavigation } from "./word-navigation";

function retainedCellFixture() {
  const original = "| one | two three |\n| --- | --- |";
  let document = original;
  let state = EditorState.create({ doc: "one", selection: { anchor: 0 } });
  const active = { row: 0, column: 0 };
  const view = {
    get state() {
      return state;
    },
    contentDOM: new EventTarget(),
    composing: false,
    dom: {},
    focus() {},
    dispatch(...specs: TransactionSpec[]) {
      const transaction = state.update(...specs);
      state = transaction.state;
      if (transaction.docChanged && !editor.reconciling) {
        document = ChangeSet.of(
          projectedChanges(document, active, state.doc.toString(), 0),
          document.length,
        )
          .apply(Text.of(document.split("\n")))
          .toString();
      }
    },
  } as unknown as EditorView;
  const editor = {
    view,
    reconciling: false,
    source: new CellSource(parseTable(original)!.rows[0]![0]!),
    label() {},
    retarget: CellEditor.prototype.retarget,
  };
  const grid = {
    get block() {
      return { source: document };
    },
    get model() {
      return parseTable(document)!;
    },
    root: { isConnected: true, focus() {} },
    outer: { state: EditorState.create(), dispatch() {} },
    start: () => 0,
    contentElement: () => ({ replaceChildren() {} }),
    display() {},
    replace() {
      assert.fail("stale paste must not replace the table");
    },
  } as unknown as TableGrid;
  const projection = new CellProjection(
    grid,
    {
      disposeContent() {},
    } as unknown as TableEnvironment,
    {
      activate() {},
      highlight() {},
      move: () => false,
      arrow: () => false,
    },
  );
  projection.active = active;
  projection.cellEditor = editor as unknown as CellEditor;
  let complete: (text: string) => void = () => {};
  const pending = new Promise<string>((resolve) => {
    complete = resolve;
  });
  const clipboard = new TableClipboard(grid, projection, {} as TableSelection, {
    copy() {},
    paste: () => pending,
    wrap: () => false,
    clearFormatting: (text) => text,
    canFormat: false,
  });
  const cm = new CodeMirror(view);
  Vim.maybeInitVimState_(cm);
  const installed = installCellWordNavigation(view, cm, (motion, count) =>
    projection["moveWord"](motion, count),
  );
  return {
    original,
    grid,
    projection,
    view,
    active,
    clipboard,
    cm,
    installed,
    complete,
  };
}

for (const sequence of ["w", "wb"]) {
  test(`delayed paste rejects retained cell navigation ${sequence} at identical local offsets`, async () => {
    const fixture = retainedCellFixture();
    const selection = fixture.view.state.selection;
    const paste = fixture.clipboard.pasteFromMenu({
      anchor: fixture.active,
      head: fixture.active,
    });
    try {
      for (const key of sequence) {
        Vim.handleKey(fixture.cm, key, "user");
      }
      assert.equal(fixture.projection.inner, fixture.view);
      assert.equal(fixture.projection.active, fixture.active);
      assert.equal(selection.eq(fixture.view.state.selection), true);
      assert.deepEqual(fixture.active, {
        row: 0,
        column: sequence === "w" ? 1 : 0,
      });
      assert.equal(
        fixture.view.state.doc.toString(),
        sequence === "w" ? "two three" : "one",
      );
      fixture.complete("PASTE");
      await assert.rejects(paste, /changed before paste completed/);
      assert.equal(fixture.grid.block.source, fixture.original);
      assert.equal(
        fixture.view.state.doc.toString(),
        sequence === "w" ? "two three" : "one",
      );
    } finally {
      fixture.installed.destroy();
    }
  });
}
