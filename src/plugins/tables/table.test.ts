import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { CellSource, cellSyntax } from "./cell-source";
import { parseTable } from "../../markdown/tables/model";
import { operateTable } from "../../markdown/tables/operations";
import { tableOperation } from "./commands";
import { tableCommands } from "./manifest";
import { arrowStep } from "./navigation";
import { nearestEntry } from "./hit-test";
import { revealTableSource, tableSource } from "./state";
import { displayedCell } from "./content";
const source = "| head | second |\n| --- | --- |\n| value | other |";

test("cell source projection retains entered whitespace and escapes pipes without a second history", () => {
  const original = parseTable(source)!.rows[1]![0]!;
  const projection = new CellSource(original);
  const nextSource = source.replace("value", "  新 value  ");
  const cell = parseTable(nextSource)!.rows[1]![0]!;
  const range = projection.range(nextSource, cell);
  assert.equal(nextSource.slice(range.from, range.to), "  新 value  ");
  const state = EditorState.create({ doc: "a", extensions: [cellSyntax] });
  const changed = state.update({ changes: { from: 1, insert: "|b\nc" } }).state;
  assert.equal(changed.doc.toString(), "a\\|b<br>c");
});

test("every contributed table command produces a valid operation and preserves an editable table", () => {
  const model = parseTable(source)!;
  for (const [id] of tableCommands) {
    const operation = tableOperation(id, { row: 1, column: 1 });
    assert.ok(operation, id);
    assert.ok(parseTable(operateTable(model, operation)), id);
  }
  const insert = tableOperation("insert-row-below", { row: 1, column: 0 })!;
  assert.equal(parseTable(operateTable(model, insert))!.rows.length, 3);
  assert.deepEqual(tableOperation("align-center", { row: 1, column: 1 }), {
    type: "align",
    from: 1,
    to: 1,
    alignment: "center",
  });
});

test("table hit testing uses physical coordinates in RTL and source disclosure maps through edits", () => {
  assert.deepEqual(arrowStep("ArrowLeft", true), { row: 0, column: 1 });
  const entries = [100, 50, 0].map((left) => ({
    getBoundingClientRect: () => ({
      left,
      right: left + 40,
      top: 0,
      bottom: 20,
    }),
  })) as unknown as Element[];
  assert.equal(nearestEntry(entries, "column", { x: 55, y: 0 }), 1);
  assert.equal(nearestEntry(entries, "column", { x: -100, y: 0 }), 2);
  let state = EditorState.create({ doc: source, extensions: [tableSource] });
  state = state.update({ effects: revealTableSource.of(0) }).state;
  state = state.update({ changes: { from: 0, insert: "prefix\n" } }).state;
  assert.equal(state.field(tableSource), 7);
});

test("a rendered cell shows an escaped pipe without its backslash, even in code", () => {
  assert.equal(
    displayedCell("`code \\| pipe` and a \\| b"),
    "`code | pipe` and a | b",
  );
  assert.equal(displayedCell("no pipes"), "no pipes");
});
