import assert from "node:assert/strict";
import test from "node:test";
import { peekEstimatedHeight } from "./estimated-height";

test("multi-line peek reserves far above one line", () => {
  assert.ok(peekEstimatedHeight(1) > 40);
  assert.ok(peekEstimatedHeight(40) > 700);
  assert.ok(peekEstimatedHeight(40) > peekEstimatedHeight(2) * 5);
});
