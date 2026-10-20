import assert from "node:assert/strict";
import test from "node:test";
import { tableEstimatedHeight } from "./estimated-height";

test("empty or invalid source still reserves one row of chrome", () => {
  assert.ok(tableEstimatedHeight("") > 20);
  assert.ok(tableEstimatedHeight("not a table") > 20);
});

test("row count drives the reserve; delimiter is not a painted row", () => {
  const small = tableEstimatedHeight("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
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

test("40-row remount fixture estimate clears 0.7× tight-cell measured height", () => {
  // After collapsing markdown-rendered margins in cells, measured ≈ estimate.
  // Guard: reserve must stay above ~0.7 × prior inflated ~3605 (~2524) only if
  // margins return; with tight cells, estimate (~1205) matches measured.
  const source = [
    "| A | B | C |",
    "| --- | --- | --- |",
    ...Array.from(
      { length: 40 },
      (_, i) =>
        `| cell-${i}-a | cell-${i}-b with longer text to widen | cell-${i}-c |`,
    ),
  ].join("\n");
  const height = tableEstimatedHeight(source);
  // 41 painted rows × ~28.8 + chrome ≈ 1205.
  assert.ok(height > 1000, `got ${height}`);
  assert.ok(
    height < 2000,
    `tight-cell estimate should not assume 85px rows, got ${height}`,
  );
});
