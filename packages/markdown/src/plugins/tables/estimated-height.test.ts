import assert from "node:assert/strict";
import test from "node:test";
import { tableEstimatedHeight } from "./estimated-height";

test("empty or invalid source still reserves one row of chrome", () => {
  assert.ok(tableEstimatedHeight("") > 20);
  assert.ok(tableEstimatedHeight("not a table") > 20);
});

test("row count drives the reserve; delimiter is not a painted row", () => {
  const small = tableEstimatedHeight(
    "| A | B |\n| --- | --- |\n| 1 | 2 |\n",
  );
  const large = tableEstimatedHeight(
    [
      "| A | B | C |",
      "| --- | --- | --- |",
      ...Array.from(
        { length: 40 },
        (_, i) => `| cell-${i}-a | cell-${i}-b | cell-${i}-c |`,
      ),
    ].join("\n"),
  );
  // 2 painted rows (header + 1 body) vs 41 (header + 40 body).
  assert.ok(small > 40);
  assert.ok(large > small * 5);
  assert.ok(large > 800, `expected tall reserve, got ${large}`);
});

test("WorkVault-scale 40-row table is far above the one-line default", () => {
  const source = [
    "| A | B | C |",
    "| --- | --- | --- |",
    ...Array.from(
      { length: 40 },
      (_, i) => `| cell-${i}-a | cell-${i}-b with longer text | cell-${i}-c |`,
    ),
  ].join("\n");
  const height = tableEstimatedHeight(source);
  // Default WidgetType estimatedHeight (-1) → ~24px. Measured ~1250px.
  assert.ok(height > 400, `got ${height}`);
});
