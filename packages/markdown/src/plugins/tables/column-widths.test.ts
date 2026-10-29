import test from "node:test";
import assert from "node:assert/strict";
import {
  applyColumnWidth,
  formatColWidthsComment,
  joinTableSource,
  parseColWidthsComment,
  remapColumnWidths,
  splitTableSource,
  tableBlockRange,
  extendTableRangeForWidths,
  sourceAfterOperation,
  widthsAfterOperation,
} from "./column-widths";
import type { TableOperation } from "../../markdown/tables/operations";

const table = "| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |";

test("parseColWidthsComment reads pixel widths from the Lumière comment", () => {
  assert.deepEqual(
    parseColWidthsComment("<!-- lumiere-col-widths: 120, 80, 200 -->"),
    [120, 80, 200],
  );
  assert.equal(parseColWidthsComment("<!-- other -->"), undefined);
  assert.equal(parseColWidthsComment("| a | b |"), undefined);
});

test("formatColWidthsComment round-trips integer pixel widths", () => {
  assert.equal(
    formatColWidthsComment([120, 80.4, 200]),
    "<!-- lumiere-col-widths: 120,80,200 -->",
  );
});

test("splitTableSource and joinTableSource persist widths after the GFM table", () => {
  const withWidths = joinTableSource(table, [120, 80, 200]);
  assert.equal(withWidths, `${table}\n<!-- lumiere-col-widths: 120,80,200 -->`);
  assert.deepEqual(splitTableSource(withWidths), {
    table,
    widths: [120, 80, 200],
  });
  assert.deepEqual(splitTableSource(table), { table, widths: undefined });
  assert.equal(joinTableSource(table, undefined), table);
  assert.equal(joinTableSource(table, []), table);
});

test("applyColumnWidth updates one column and clamps to a minimum", () => {
  assert.deepEqual(applyColumnWidth([100, 100, 100], 1, 140), [100, 140, 100]);
  assert.deepEqual(applyColumnWidth([100, 100, 100], 0, 10), [60, 100, 100]);
});

test("remapColumnWidths follows insert, delete, move and duplicate of columns", () => {
  const widths = [10, 20, 30, 40];
  assert.deepEqual(remapColumnWidths(widths, { type: "insert", index: 1 }), [
    10,
    undefined,
    20,
    30,
    40,
  ]);
  assert.deepEqual(
    remapColumnWidths(widths, { type: "delete", from: 1, to: 2 }),
    [10, 40],
  );
  assert.deepEqual(
    remapColumnWidths(widths, {
      type: "move",
      from: 0,
      to: 0,
      destination: 2,
    }),
    [20, 30, 10, 40],
  );
  assert.deepEqual(
    remapColumnWidths(widths, { type: "duplicate", from: 1, to: 1 }),
    [10, 20, 20, 30, 40],
  );
  assert.equal(
    remapColumnWidths(undefined, { type: "insert", index: 0 }),
    undefined,
  );
});

test("tableBlockRange expands a Table node to include a trailing widths comment", () => {
  const doc = `# Title\n\n${table}\n<!-- lumiere-col-widths: 100,100,100 -->\n\nTail`;
  const tableFrom = doc.indexOf("| a |");
  const tableTo = tableFrom + table.length;
  const commentTo = doc.indexOf("-->") + 3;
  assert.deepEqual(tableBlockRange(doc, tableFrom, tableTo), {
    from: tableFrom,
    to: commentTo,
  });
  const bare = `# Title\n\n${table}\n\nTail`;
  const from = bare.indexOf("| a |");
  const to = from + table.length;
  assert.deepEqual(tableBlockRange(bare, from, to), { from, to });
});

test("split/join survive reload: widths round-trip through source", () => {
  const saved = joinTableSource(table, [90, 110, 130]);
  const reloaded = splitTableSource(saved);
  assert.deepEqual(reloaded.widths, [90, 110, 130]);
  assert.equal(reloaded.table, table);
  const resized = applyColumnWidth(reloaded.widths!, 2, 180);
  assert.equal(
    joinTableSource(reloaded.table, resized),
    `${table}\n<!-- lumiere-col-widths: 90,110,180 -->`,
  );
});

test("extendTableRangeForWidths only grows when the next line is widths metadata", () => {
  assert.deepEqual(
    extendTableRangeForWidths("<!-- lumiere-col-widths: 10,20 -->", 5, 40, 80),
    { from: 5, to: 80 },
  );
  assert.deepEqual(extendTableRangeForWidths("not a comment", 5, 40, 80), {
    from: 5,
    to: 40,
  });
});

test("sourceAfterOperation remaps widths when a column is deleted", () => {
  const table = "| a | b |\n| --- | --- |\n| 1 | 2 |";
  const op: TableOperation = {
    type: "delete",
    axis: "column",
    from: 0,
    to: 0,
  };
  // operateTable not needed here: sourceAfterOperation only joins remapped widths
  const source = sourceAfterOperation(table, [100, 200], op);
  assert.equal(source, `${table}\n<!-- lumiere-col-widths: 200 -->`);
  assert.deepEqual(widthsAfterOperation([100, 200], op), [200]);
});
