import test from "node:test";
import assert from "node:assert/strict";
import { codeOffset } from "./code-selection";
test("highlighted clicks map indentation and UTF-16 back to fenced and indented source", () => {
  assert.equal(codeOffset("```js\n  🧠 x\n```", "🧠 x", 0, 3, true), 11);
  assert.equal(
    codeOffset("    hello\n    world", "hello\nworld", 1, 2, false),
    16,
  );
  assert.equal(codeOffset("```\none\n```", "wrong", 0, 1, true), undefined);
  assert.equal(codeOffset("```\none\n```", "one", 5, 0, true), undefined);
});
