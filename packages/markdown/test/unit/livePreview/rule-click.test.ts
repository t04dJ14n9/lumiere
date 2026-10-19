import test from "node:test";
import assert from "node:assert/strict";
import { ruleSelection } from "../../../src/plugins/livePreview/rule-click";

test("as in Obsidian, a click on a rule selects its source with the head at its start", () => {
  // "above\n\n---": Obsidian selects anchor 10, head 7.
  assert.deepEqual(ruleSelection("---", 7), { anchor: 10, head: 7 });
  assert.deepEqual(ruleSelection("* * *", 0), { anchor: 5, head: 0 });
  // Indentation and trailing spaces are not the rule.
  assert.deepEqual(ruleSelection("  ___  ", 20), { anchor: 25, head: 22 });
});
