import test from "node:test";
import assert from "node:assert/strict";
import { savedImageScale } from "./image";
test("image zoom restoration validates scale before using the legacy actual-size flag", () => {
  assert.equal(savedImageScale({ scale: 20 }), 8);
  assert.equal(savedImageScale({ scale: 0.25, actual: true }), 0.25);
  for (const scale of [0, -1, Infinity, NaN, "2", null]) {
    assert.equal(savedImageScale({ scale }), null);
    assert.equal(savedImageScale({ scale, actual: true }), 1);
  }
  assert.equal(savedImageScale(undefined), null);
  assert.equal(savedImageScale({ actual: true }), 1);
});
