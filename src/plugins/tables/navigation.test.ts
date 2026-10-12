import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { Direction, type EditorView } from "@codemirror/view";
import { parseTable, type CellPosition } from "../../markdown/tables/model";
import { TableKeyboard } from "./keyboard";
import { cellArrow, entersTable, navigationKey } from "./navigation";
import type { TableGrid } from "./grid";
import type { CellProjection } from "./projection";
import type { TableSelection } from "./selection";

const source = "| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";

function keyboardFixture(position: CellPosition, standalone = false) {
  const prefix = standalone ? "" : "Before\n\n";
  let state = EditorState.create({
    doc: prefix + source + (standalone ? "" : "\n\nAfter"),
  });
  const opened: {
    position: CellPosition;
    selection: number | "all" | undefined;
  }[] = [];
  const requested: CellPosition[] = [];
  const replacements: string[] = [];
  const projection = {
    active: position as CellPosition | undefined,
    inner: undefined,
    open(position: CellPosition, selection?: number | "all") {
      this.active = position;
      opened.push({ position, selection });
    },
    close() {
      this.active = undefined;
    },
  };
  const outer = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    focus() {},
  } as EditorView;
  const grid = {
    outer,
    model: parseTable(source)!,
    block: { source },
    start: () => prefix.length,
    commandGroup: () => "table-test",
    replace(text: string) {
      replacements.push(text);
    },
  } as unknown as TableGrid;
  const keyboard = new TableKeyboard(
    grid,
    projection as unknown as CellProjection,
    {
      highlight() {},
    } as TableSelection,
    {
      request: (position) => {
        requested.push(position);
      },
      deactivate() {},
      menu() {},
    },
  );
  return { keyboard, opened, requested, replacements, outer };
}

test("Tab, Shift+Tab and Enter route to the expected cells without changing existing rows", () => {
  const examples = [
    { from: { row: 1, column: 0 }, step: [0, 1], to: { row: 1, column: 1 } },
    { from: { row: 1, column: 2 }, step: [0, 1], to: { row: 2, column: 0 } },
    { from: { row: 2, column: 0 }, step: [0, -1], to: { row: 1, column: 2 } },
    { from: { row: 1, column: 2 }, step: [1, 0], to: { row: 2, column: 2 } },
  ];
  for (const { from, step, to } of examples) {
    const fixture = keyboardFixture(from);
    assert.equal(fixture.keyboard.move(step[0]!, step[1]!), true);
    assert.deepEqual(fixture.opened, [{ position: to, selection: "all" }]);
    assert.deepEqual(fixture.replacements, []);
  }
});

test("Tab at the final cell and Enter on the final row append exactly one aligned empty row", () => {
  for (const { position, step, column } of [
    { position: { row: 2, column: 2 }, step: [0, 1], column: 0 },
    { position: { row: 2, column: 1 }, step: [1, 0], column: 1 },
  ]) {
    const fixture = keyboardFixture(position);
    fixture.keyboard.move(step[0]!, step[1]!);
    assert.deepEqual(fixture.requested, [{ row: 3, column }]);
    assert.equal(fixture.replacements.length, 1);
    const table = parseTable(fixture.replacements[0]!)!;
    assert.equal(table.rows.length, 4);
    assert.deepEqual(
      table.rows[3]!.map((cell) => cell.text),
      ["", "", ""],
    );
    assert.deepEqual(table.alignments, [null, "center", "right"]);
    assert.equal(table.source.split("\n").at(-1), "|     |     |     |");
  }
});

test("ArrowDown leaves without adding a table row and ArrowUp entry retains the exit column", () => {
  const fixture = keyboardFixture({ row: 2, column: 1 });
  assert.equal(fixture.keyboard.arrow({ row: 1, column: 0 }, false), true);
  assert.deepEqual(fixture.replacements, []);
  assert.equal(
    fixture.outer.state.selection.main.head,
    "Before\n\n".length + source.length + 1,
  );
  const bounds = {
    from: "Before\n\n".length,
    to: "Before\n\n".length + source.length,
  };
  assert.equal(entersTable(fixture.outer.state, bounds, -1), true);
  fixture.keyboard.enter(-1);
  assert.deepEqual(fixture.opened.at(-1)?.position, { row: 2, column: 1 });
});

test("Shift+Tab before the header leaves above it; ArrowDown at EOF makes prose space, not a row", () => {
  const before = keyboardFixture({ row: 0, column: 0 });
  before.keyboard.move(0, -1);
  assert.equal(
    before.outer.state.doc.lineAt(before.outer.state.selection.main.head).text,
    "",
  );
  assert.deepEqual(before.replacements, []);
  const after = keyboardFixture({ row: 2, column: 2 }, true);
  after.keyboard.arrow({ row: 1, column: 0 }, false);
  assert.equal(after.outer.state.doc.toString(), source + "\n\n");
  assert.deepEqual(after.replacements, []);
  assert.equal(
    entersTable(after.outer.state, { from: 0, to: source.length }, -1),
    true,
  );
  after.keyboard.enter(-1);
  assert.deepEqual(after.opened.at(-1)?.position, { row: 2, column: 2 });
});

test("table entry only claims adjacent, empty document selections", () => {
  const doc = "Before\n\n" + source + "\n\nAfter";
  const bounds = { from: 8, to: 8 + source.length };
  const state = (anchor: number, head = anchor) =>
    EditorState.create({ doc, selection: { anchor, head } });
  assert.equal(entersTable(state(7), bounds, 1), true);
  assert.equal(entersTable(state(bounds.to + 1), bounds, -1), true);
  assert.equal(entersTable(state(0), bounds, 1), false);
  assert.equal(entersTable(state(doc.length), bounds, -1), false);
  assert.equal(
    entersTable(state(bounds.to + 1, bounds.to + 2), bounds, -1),
    false,
  );
});

test("horizontal arrows leave a cell only at text edges; vertical arrows respect wrapped text", () => {
  let state = EditorState.create({ doc: "abc", selection: { anchor: 1 } });
  let wrapped = false;
  const view = {
    get state() {
      return state;
    },
    composing: false,
    textDirectionAt: () => Direction.LTR,
    moveVertically: () => ({ head: 3 }),
    coordsAtPos: (position: number) => ({
      top: wrapped && position === 3 ? 20 : 0,
    }),
  } as unknown as EditorView;
  assert.equal(cellArrow(view, "ArrowLeft", false), undefined);
  assert.equal(cellArrow(view, "ArrowRight", false), undefined);
  state = state.update({ selection: { anchor: 0 } }).state;
  assert.deepEqual(cellArrow(view, "ArrowLeft", false), { row: 0, column: -1 });
  state = state.update({ selection: { anchor: 3 } }).state;
  assert.deepEqual(cellArrow(view, "ArrowRight", false), { row: 0, column: 1 });
  state = state.update({ selection: { anchor: 1 } }).state;
  wrapped = true;
  assert.equal(cellArrow(view, "ArrowDown", false), undefined);
  wrapped = false;
  assert.deepEqual(cellArrow(view, "ArrowDown", false), { row: 1, column: 0 });
  state = state.update({ selection: { anchor: 0, head: 3 } }).state;
  assert.equal(cellArrow(view, "ArrowRight", false), undefined);
});

function vimMode(
  options: {
    keys?: string;
    count?: string;
    motionCount?: string;
    operator?: string | null;
    insertMode?: boolean;
    visualMode?: boolean;
  } = {},
) {
  return {
    insertMode: options.insertMode ?? false,
    visualMode: options.visualMode ?? false,
    inputState: {
      keyBuffer: [...(options.keys ?? "")],
      prefixRepeat: [...(options.count ?? "")],
      motionRepeat: [...(options.motionCount ?? "")],
      operator: options.operator ?? null,
    },
  } as NonNullable<Parameters<typeof navigationKey>[1]>;
}

test("normal cell j/k and gj/gk hop one row even with a pending count", () => {
  // Vim keeps typed digits (and the g prefix) in its key buffer.
  for (const typed of ["", "2", "9", "123"]) {
    for (const keys of [typed, `${typed}g`]) {
      const mode = vimMode({ keys });
      assert.equal(navigationKey("j", mode), "ArrowDown");
      assert.equal(navigationKey("k", mode), "ArrowUp");
    }
  }
});

test("cell operators, visual and insert modes retain Vim's handling of j/k", () => {
  for (const options of [
    { operator: "delete" },
    { operator: "change", motionCount: "2" },
    { operator: "yank", count: "9" },
    { visualMode: true },
    { visualMode: true, count: "9" },
    { visualMode: true, keys: "g" },
    { visualMode: true, keys: "9" },
    { operator: "delete", keys: "2" },
    { keys: "9f" },
    { insertMode: true },
    { keys: "f" },
    { keys: "r" },
    { keys: "z" },
  ]) {
    for (const key of ["j", "k"]) {
      assert.equal(navigationKey(key, vimMode(options)), undefined);
    }
  }
});

test("existing arrows, h/l and pending horizontal keys retain their routing", () => {
  for (const mode of [undefined, vimMode(), vimMode({ insertMode: true })]) {
    assert.equal(navigationKey("ArrowDown", mode), "ArrowDown");
    assert.equal(navigationKey("ArrowUp", mode), "ArrowUp");
  }
  assert.equal(navigationKey("h", vimMode()), "ArrowLeft");
  assert.equal(navigationKey("l", vimMode()), "ArrowRight");
  assert.equal(navigationKey("j", undefined), undefined);
  assert.equal(navigationKey("Escape", vimMode()), undefined);
  for (const options of [
    { count: "9" },
    { keys: "g" },
    { operator: "delete" },
  ]) {
    for (const key of ["h", "l", "ArrowDown", "ArrowUp"]) {
      assert.equal(navigationKey(key, vimMode(options)), undefined);
    }
  }
});
