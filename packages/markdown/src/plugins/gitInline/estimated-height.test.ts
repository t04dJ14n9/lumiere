import assert from "node:assert/strict";
import test from "node:test";
import { ghostEstimatedHeight } from "./estimated-height";

test("empty ghost still reserves caption chrome", () => {
  assert.ok(ghostEstimatedHeight("") > 40);
});

test("multi-paragraph removal reserves far above one line", () => {
  const small = ghostEstimatedHeight("one line");
  const large = ghostEstimatedHeight(
    Array.from({ length: 40 }, (_, i) => `Removed paragraph ${i}.`).join(
      "\n\n",
    ),
  );
  assert.ok(small > 40);
  assert.ok(large > small * 5);
  assert.ok(large > 800, `got ${large}`);
});

test("a long wrapping paragraph reserves tall height without newlines", () => {
  const long = Array.from(
    { length: 80 },
    (_, i) => `UniqueDeletedSentence${i} with enough words.`,
  ).join(" ");
  const height = ghostEstimatedHeight(long);
  assert.ok(height > 400, `got ${height}`);
});
