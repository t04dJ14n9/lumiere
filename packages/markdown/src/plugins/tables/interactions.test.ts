import test from "node:test";
import assert from "node:assert/strict";
import {
  ChangeSet,
  EditorState,
  Text,
  type TransactionSpec,
} from "@codemirror/state";
import { parseTable } from "../../markdown/tables/model";
import { CellProjection, projectedChanges } from "./projection";
import { tableSelectionChanges } from "./state";
import type { TableGrid } from "./grid";
import { CellEditor } from "./cell-editor";
import type { TableEnvironment } from "./environment";
import { axisRange } from "./selection";
import { wrapCell } from "./keyboard";
import { containsCell } from "./toolbar";
import { tableMenu, type TableMenuActions } from "./menu";
import { tableOperation } from "./commands";
import type { EditorView } from "@codemirror/view";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import { CellSource } from "./cell-source";
import { installCellWordNavigation } from "./word-navigation";

const source = "| first | second |\n| --- | --- |\n| alpha | beta |";
const table = parseTable(source)!;

test("cell projection preserves table syntax and the surrounding document", () => {
  const prefix = "# Heading\n\n";
  const outer = prefix + source + "\n\nTail";
  for (const text of ["a changed cell", "", "😀字"]) {
    const changes = projectedChanges(
      source,
      { row: 1, column: 0 },
      text,
      prefix.length,
    );
    const result = ChangeSet.of(changes, outer.length)
      .apply(Text.of(outer.split("\n")))
      .toString();
    assert.ok(result.startsWith(prefix));
    assert.ok(result.endsWith("\n\nTail"));
    const next = parseTable(result.slice(prefix.length, -6))!;
    assert.equal(next.rows[1]![0]!.text, text);
    assert.equal(next.rows[1]![1]!.text, "beta");
    assert.deepEqual(next.alignments, table.alignments);
  }
});

test("typing in a cell realigns every row in the same outer edit", () => {
  const source = "| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |";
  const prefix = "Before\n\n";
  const outer = prefix + source + "\n\nAfter";
  const result = ChangeSet.of(
    projectedChanges(source, { row: 1, column: 0 }, "long", prefix.length),
    outer.length,
  )
    .apply(Text.of(outer.split("\n")))
    .toString();
  assert.equal(
    result,
    prefix +
      "| a    |  b  |   c |\n| ---- | :-: | --: |\n| long |  2  |   3 |\n\nAfter",
  );
});

test("axis selections and reverse rectangles use inclusive cell bounds", () => {
  assert.deepEqual(axisRange(table, "row", 1), {
    anchor: { row: 1, column: 0 },
    head: { row: 1, column: 1 },
  });
  assert.deepEqual(axisRange(table, "column", 1), {
    anchor: { row: 0, column: 1 },
    head: { row: 1, column: 1 },
  });
  const range = { anchor: { row: 2, column: 3 }, head: { row: 0, column: 1 } };
  assert.equal(containsCell(range, { row: 1, column: 2 }), true);
  assert.equal(containsCell(range, range.anchor), true);
  assert.equal(containsCell(range, { row: 1, column: 0 }), false);
  assert.equal(containsCell(undefined, range.head), false);
});

test("aligned rewrites preserve source anchors in other cells and materialize omitted cells", () => {
  for (const source of [
    "a | b | c\n--- | :-: | --:\n1 | keep | 3\n4 | 5 | 6",
    "| a | b | c |\n|---|:-:|--:|\n| 1 | keep | 3 |\n| 4 |",
  ]) {
    const table = parseTable(source)!;
    const untouched = table.rows[1]![1]!;
    const changes = ChangeSet.of(
      projectedChanges(source, { row: 2, column: 2 }, "a longer cell", 0),
      source.length,
    );
    const result = changes.apply(Text.of(source.split("\n"))).toString();
    const next = parseTable(result)!;
    assert.equal(next.rows[2]![2]!.text, "a longer cell");
    assert.equal(next.rows[2]![2]!.missing, undefined);
    assert.equal(
      changes.mapPos(untouched.from + 1),
      next.rows[1]![1]!.from + 1,
    );
    assert.equal(
      result.slice(
        changes.mapPos(untouched.from),
        changes.mapPos(untouched.to, -1),
      ),
      "keep",
    );
  }
});

test("cell movement wraps columns while retaining exit and append-row targets", () => {
  assert.deepEqual(wrapCell({ row: 1, column: 2 }, 2), { row: 2, column: 0 });
  assert.deepEqual(wrapCell({ row: 0, column: -1 }, 2), { row: -1, column: 1 });
  assert.deepEqual(wrapCell({ row: 1, column: 0 }, 2), { row: 1, column: 0 });
});

test("closing a cell restores its render and clears the projected selection notification", () => {
  const selected: boolean[] = [];
  const rendered: unknown[] = [];
  const state = EditorState.create({
    extensions: tableSelectionChanges.of((value) => {
      selected.push(value);
    }),
  });
  const projection = new CellProjection(
    {
      outer: { state },
      display(position: unknown) {
        rendered.push(position);
      },
    } as unknown as TableGrid,
    {} as TableEnvironment,
    {
      activate() {},
      highlight() {},
      move: () => false,
      arrow: () => false,
    },
  );
  projection.active = { row: 1, column: 1 };
  let destroyed = false;
  projection.cellEditor = {
    destroy() {
      destroyed = true;
    },
  } as CellEditor;
  projection.close();
  assert.equal(destroyed, true);
  assert.equal(projection.active, undefined);
  assert.equal(projection.inner, undefined);
  assert.deepEqual(rendered, [{ row: 1, column: 1 }]);
  assert.deepEqual(selected, [false]);
});

test("table menus preserve axis bounds, command focus and action order", () => {
  const calls: unknown[] = [];
  const actions: TableMenuActions = {
    copy: (cut) => {
      calls.push(cut);
    },
    paste: async () => {},
    selectAll: () => {},
    format: (marker) => {
      calls.push(marker);
    },
    clear: () => {},
    execute: (operation, focus) => {
      calls.push({ operation, focus });
    },
  };
  const range = axisRange(table, "column", 0);
  const menu = tableMenu(table, range, actions, "column");
  assert.deepEqual(
    menu.map((item) => item.label),
    [
      "Add column to the left",
      "Add column to the right",
      "Move column left",
      "Move column right",
      "Align left",
      "Align center",
      "Align right",
      "Duplicate column",
      "Delete column",
      "Sort by column (A to Z)",
      "Sort by column (Z to A)",
    ],
  );
  assert.equal(menu[2]!.disabled, true);
  assert.equal(menu[3]!.disabled, false);
  menu[3]!.run!();
  assert.deepEqual(calls.pop(), {
    operation: { type: "move", axis: "column", from: 0, to: 0, destination: 1 },
    focus: { row: 0, column: 1 },
  });
  menu[5]!.run!();
  assert.deepEqual(calls.pop(), {
    operation: { type: "align", from: 0, to: 0, alignment: "center" },
    focus: range.head,
  });
  const general = tableMenu(table, range, actions);
  assert.deepEqual(
    general.slice(0, 8).map((item) => item.label),
    [
      "Cut",
      "Copy",
      "Paste",
      "Paste as plain text",
      "Select all",
      "Format",
      "Row",
      "Column",
    ],
  );
  assert.equal(
    general.some((item) => item.label === "Edit table source"),
    false,
  );
});

test("cell menu includes all row operations, disabled boundary moves and working clipboard callbacks", async () => {
  const calls: unknown[] = [];
  const actions: TableMenuActions = {
    copy: (cut) => {
      calls.push(cut ? "cut" : "copy");
    },
    paste: async (plainText) => {
      calls.push(plainText ? "plain" : "paste");
    },
    selectAll: () => {
      calls.push("all");
    },
    format: (marker) => {
      calls.push(marker);
    },
    clear: () => {},
    execute: (operation, focus) => {
      calls.push({ operation, focus });
    },
    canFormat: false,
  };
  const position = { row: 1, column: 1 };
  const menu = tableMenu(table, { anchor: position, head: position }, actions);
  for (const item of menu.slice(0, 5)) {
    await item.run!();
  }
  assert.deepEqual(calls, ["cut", "copy", "paste", "plain", "all"]);
  assert.equal(menu.find((item) => item.label === "Format")!.disabled, true);
  const rows = menu.find((item) => item.label === "Row")!.children!;
  assert.deepEqual(
    rows.map((item) => item.label),
    [
      "Add row above",
      "Add row below",
      "Move row up",
      "Move row down",
      "Duplicate row",
      "Delete row",
    ],
  );
  assert.equal(rows[2]!.disabled, false);
  assert.equal(rows[3]!.disabled, true);
  rows[4]!.run!();
  assert.deepEqual(calls.at(-1), {
    operation: { type: "duplicate", axis: "row", from: 1, to: 1 },
    focus: { row: 2, column: 1 },
  });
});

test("table command parsing keeps alignment validation and movement boundaries", () => {
  const cell = { row: 0, column: 1 };
  assert.deepEqual(tableOperation("align-right", cell), {
    type: "align",
    from: 1,
    to: 1,
    alignment: "right",
  });
  assert.equal(tableOperation("align-invalid", cell), undefined);
  assert.deepEqual(tableOperation("move-row-up", cell), {
    type: "move",
    axis: "row",
    from: 0,
    to: 0,
    destination: 0,
  });
});

test("cross-cell macro replay keeps the adapter and projects edits into the destination", () => {
  const original = "| one | two three |\n| --- | --- |";
  let document = original;
  let state = EditorState.create({ doc: "one" });
  const active = { row: 0, column: 0 };
  const labels: string[] = [];
  const rendered: unknown[] = [];
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
        const changes = projectedChanges(
          document,
          active,
          state.doc.toString(),
          0,
        );
        document = ChangeSet.of(changes, document.length)
          .apply(Text.of(document.split("\n")))
          .toString();
      }
    },
  } as unknown as EditorView;
  const editor = {
    view,
    reconciling: false,
    source: new CellSource(parseTable(original)!.rows[0]![0]!),
    label(position: { row: number; column: number }) {
      labels.push(`${position.row}:${position.column}`);
    },
    retarget: CellEditor.prototype.retarget,
    destroy() {
      assert.fail("word motion must retain the macro's adapter");
    },
  };
  const projection = new CellProjection(
    {
      get model() {
        return parseTable(document)!;
      },
      root: { isConnected: false },
      contentElement: () => ({ replaceChildren() {} }),
      display(position: unknown) {
        rendered.push(position);
      },
    } as unknown as TableGrid,
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
  const cm = new CodeMirror(view);
  Vim.maybeInitVimState_(cm);
  Object.defineProperty(cm, "openDialog", { value: undefined });
  const installed = installCellWordNavigation(view, cm, (motion, count) =>
    projection["moveWord"](motion, count),
  );
  const register = Vim.getRegisterController().getRegister("a");
  const keys = (sequence: string) => {
    for (const key of sequence) {
      Vim.handleKey(cm, key, "user");
    }
  };
  try {
    keys("qawxq");
    assert.equal(parseTable(document)!.rows[0]![1]!.text, "wo three");
    assert.equal(register.keyBuffer.join(""), "wx");
    assert.equal(projection.cellEditor, editor);
    assert.equal(projection.active, active);
    assert.deepEqual(active, { row: 0, column: 1 });
    assert.deepEqual(labels, ["0:1"]);
    assert.deepEqual(rendered, [{ row: 0, column: 0 }]);
    document = original;
    Object.assign(active, { row: 0, column: 0 });
    editor.retarget.call(
      editor as unknown as CellEditor,
      parseTable(document)!.rows[0]![0]!,
      active,
      0,
    );
    keys("@a");
    assert.equal(parseTable(document)!.rows[0]![0]!.text, "one");
    assert.equal(parseTable(document)!.rows[0]![1]!.text, "wo three");
  } finally {
    installed.destroy();
    register.clear();
  }
});
