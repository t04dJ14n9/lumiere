import assert from "node:assert/strict";
import test from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { cellForSourceOffset, parseTable } from "../../markdown/tables/model";
import type { VimMode } from "../vim/api";
import { activeTables, tableProjection } from "./state";
import type { TableController } from "./controller";
import { canEnterVimTable, observeVimTableEntry } from "./vim-entry";

const source = [
  "| alpha | beta  |",
  "| ----- | ----- |",
  "| gamma | delta |",
  "| eps   | zeta  |",
].join("\n");
const table = parseTable(source)!;
const lineStart = (line: number) =>
  source
    .split("\n")
    .slice(0, line)
    .reduce((offset, text) => offset + text.length + 1, 0);

test("A/B/P source columns own padding and internal pipes; the final pipe falls back to the first cell", () => {
  const header: [number, number][] = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [0, 5],
    [1, 0],
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 4],
    [0, 0],
  ];
  const lastRow: [number, number][] = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 3],
    [0, 3],
    [0, 3],
    [1, 0],
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 4],
    [0, 0],
  ];
  for (const [line, row, expected] of [
    [0, 0, header],
    [3, 2, lastRow],
  ] as const) {
    for (const [column, [cellColumn, offset]] of expected.entries()) {
      assert.deepEqual(
        cellForSourceOffset(table, lineStart(line) + column),
        {
          position: { row, column: cellColumn },
          offset,
        },
        `source line ${line}, column ${column}`,
      );
    }
  }
});

test("H/P delimiter targets always open the last row's first cell at zero", () => {
  for (let column = 0; column <= source.split("\n")[1]!.length; column++) {
    assert.deepEqual(cellForSourceOffset(table, lineStart(1) + column), {
      position: { row: 2, column: 0 },
      offset: 0,
    });
  }
  assert.deepEqual(cellForSourceOffset(table, lineStart(2) + 3), {
    position: { row: 1, column: 0 },
    offset: 1,
  });
  const headerOnly = parseTable(source.split("\n").slice(0, 2).join("\n"))!;
  assert.deepEqual(cellForSourceOffset(headerOnly, lineStart(1) + 14), {
    position: { row: 0, column: 0 },
    offset: 0,
  });
});

test("source mapping excludes surrounding prose and uses parsed pipe boundaries for escaped pipes", () => {
  assert.equal(cellForSourceOffset(table, -1), undefined);
  assert.equal(cellForSourceOffset(table, source.length + 1), undefined);
  const padded = parseTable("| a\\|b | c |  \n|------|---|  \n| d    | e |  ")!;
  for (const offset of [11, 12, 13]) {
    assert.deepEqual(cellForSourceOffset(padded, offset), {
      position: { row: 0, column: 0 },
      offset: 0,
    });
  }
  assert.deepEqual(cellForSourceOffset(padded, 4), {
    position: { row: 0, column: 0 },
    offset: 2,
  });
});

function entryUpdate(spec: TransactionSpec) {
  const state = EditorState.create({
    doc: source,
    extensions: EditorState.allowMultipleSelections.of(true),
  });
  const transaction = state.update(spec);
  return {
    state: transaction.state,
    selectionSet: Boolean(transaction.selection),
    docChanged: transaction.docChanged,
    transactions: [transaction],
  };
}

test("only normal Vim collapsed selections may open a table", () => {
  const update = entryUpdate({ selection: { anchor: 3 } });
  assert.equal(canEnterVimTable(update, {}), true);
  const rejected: (VimMode | undefined)[] = [
    undefined,
    { insertMode: true },
    { visualMode: true },
    { inputState: { operator: "delete" } },
    { inputState: { keyBuffer: ["g"] } },
    { inputState: { prefixRepeat: ["2"] } },
    { inputState: { motionRepeat: ["2"] } },
  ];
  for (const mode of rejected) {
    assert.equal(canEnterVimTable(update, mode), false);
  }
  for (const selection of [
    EditorSelection.range(2, 4),
    EditorSelection.create([
      EditorSelection.cursor(2),
      EditorSelection.cursor(4),
    ]),
  ]) {
    assert.equal(canEnterVimTable(entryUpdate({ selection }), {}), false);
  }
});

test("edits, pointer selections and the table's own caret projection never trigger source entry", () => {
  for (const spec of [
    {},
    { selection: { anchor: 3 }, changes: { from: 0, insert: "x" } },
    { selection: { anchor: 3 }, userEvent: "select.pointer" },
    { selection: { anchor: 3 }, userEvent: "select.pointer.drag" },
    { selection: { anchor: 3 }, annotations: tableProjection.of(true) },
  ]) {
    assert.equal(canEnterVimTable(entryUpdate(spec), {}), false);
  }
});

function entryObserverFixture() {
  const update = entryUpdate({ selection: { anchor: 3 } });
  const fixture = {
    state: update.state,
    mode: {} as VimMode,
    composing: false,
    scans: 0,
  };
  const view = {
    get state() {
      return fixture.state;
    },
    get composing() {
      return fixture.composing;
    },
    dom: {
      querySelectorAll() {
        fixture.scans++;
        return [];
      },
    },
  } as unknown as EditorView;
  const observer = observeVimTableEntry(view, () => ({
    mode: () => fixture.mode,
    extension: () => [],
    sync() {},
  }));
  return { fixture, view, observer, update };
}

test("Vim table entry waits until after the outer update", async () => {
  const { fixture, observer, update } = entryObserverFixture();
  observer.update(update);
  assert.equal(fixture.scans, 0);
  await Promise.resolve();
  assert.equal(fixture.scans, 1);
  observer.destroy();
});

test("the caret an operator leaves after its edit does not open a table, a later motion does", async () => {
  const { fixture, observer, update } = entryObserverFixture();
  observer.update(entryUpdate({ changes: { from: 0, insert: "x" } }));
  observer.update(update);
  await Promise.resolve();
  assert.equal(fixture.scans, 0);
  observer.update(update);
  await Promise.resolve();
  assert.equal(fixture.scans, 1);
  observer.destroy();
});

test("deferred source entry rejects newer transactions, mode changes, active/grid selections, composing and disposal", async () => {
  for (const cancel of [
    ({ fixture }: ReturnType<typeof entryObserverFixture>) => {
      fixture.state = fixture.state.update({ selection: { anchor: 4 } }).state;
    },
    ({ fixture }: ReturnType<typeof entryObserverFixture>) => {
      fixture.mode = { visualMode: true };
    },
    ({ fixture }: ReturnType<typeof entryObserverFixture>) => {
      fixture.mode = { inputState: { operator: "delete" } };
    },
    ({ fixture }: ReturnType<typeof entryObserverFixture>) => {
      fixture.composing = true;
    },
    ({ view }: ReturnType<typeof entryObserverFixture>) => {
      activeTables.set(view, {} as TableController);
    },
    ({ view }: ReturnType<typeof entryObserverFixture>) => {
      activeTables.set(view, {
        range: { anchor: { row: 0, column: 0 }, head: { row: 0, column: 1 } },
      } as TableController);
    },
    ({ observer }: ReturnType<typeof entryObserverFixture>) => {
      observer.destroy();
    },
  ]) {
    const entry = entryObserverFixture();
    entry.observer.update(entry.update);
    cancel(entry);
    await Promise.resolve();
    assert.equal(entry.fixture.scans, 0);
    activeTables.delete(entry.view);
    entry.observer.destroy();
  }
});
