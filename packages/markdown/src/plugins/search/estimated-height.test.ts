import assert from "node:assert/strict";
import test from "node:test";
import {
  isQueryFence,
  queryEstimatedHeight,
} from "./estimated-height";

test("detects query fences, not other languages", () => {
  assert.equal(isQueryFence("```query\ntag:#x\n```"), true);
  assert.equal(isQueryFence("~~~query\npath:notes\n~~~"), true);
  assert.equal(isQueryFence("```QUERY\n[done:false]\n```"), true);
  assert.equal(isQueryFence("```mermaid\nflowchart TB\n```"), false);
  assert.equal(isQueryFence("```\nplain\n```"), false);
});

test("short query fences reserve results-list height, not bare line count", () => {
  const source = ["```query", "tag:#fixture", "```"].join("\n");
  const height = queryEstimatedHeight(source);
  // Default WidgetType estimatedHeight (-1) → ~24px. Line×24 for 3 lines → ~84.
  assert.ok(height >= 360, `got ${height}`);
  assert.ok(height < 600, `got ${height}`);
});

test("taller query sources still keep the results floor", () => {
  const lines = Array.from({ length: 12 }, (_, i) => `line ${i}`);
  const source = ["```query", ...lines, "```"].join("\n");
  assert.ok(queryEstimatedHeight(source) >= 360);
});
