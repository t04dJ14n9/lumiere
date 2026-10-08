import test from "node:test";
import assert from "node:assert/strict";
import { listValues } from "./list-values";
import { itemOccurrence } from "./chip-values";

test("property lists accept YAML scalars without coercing values", () => {
  assert.deepEqual(listValues(null), []);
  assert.deepEqual(listValues(undefined), []);
  for (const scalar of ["", "text", 0, false, true, 1.5]) {
    assert.deepEqual(listValues(scalar), [scalar]);
  }
  const list = [null, false, "tag", 2];
  assert.equal(listValues(list), list);
  for (const unsupported of [
    { key: "value" },
    NaN,
    Infinity,
    [["nested"]],
    [undefined],
  ]) {
    assert.equal(listValues(unsupported), undefined);
  }
});

test("chip occurrence matching distinguishes scalar identity after concurrent changes", () => {
  assert.equal(
    itemOccurrence([false, "false", false], [false, false, "false"], 2),
    1,
  );
  assert.equal(itemOccurrence([null, null], [null], 1), -1);
  assert.equal(itemOccurrence([0, -0], [-0, 0], 1), 0);
});
