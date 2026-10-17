import test from "node:test";
import assert from "node:assert/strict";
import { shouldCorrectPointerClick } from "./click-position";

test("corrects empty same-line pointer clicks when DOM caret disagrees", () => {
  assert.equal(
    shouldCorrectPointerClick({
      empty: true,
      dragged: false,
      domPos: 40,
      selectionHead: 30,
      sameLine: true,
    }),
    true,
  );
});

test("does not correct drags, non-empty ranges, cross-line, or agreement", () => {
  const base = {
    empty: true,
    dragged: false,
    domPos: 40,
    selectionHead: 30,
    sameLine: true,
  };
  assert.equal(shouldCorrectPointerClick({ ...base, dragged: true }), false);
  assert.equal(shouldCorrectPointerClick({ ...base, empty: false }), false);
  assert.equal(shouldCorrectPointerClick({ ...base, sameLine: false }), false);
  assert.equal(
    shouldCorrectPointerClick({ ...base, domPos: undefined }),
    false,
  );
  assert.equal(
    shouldCorrectPointerClick({ ...base, selectionHead: 40 }),
    false,
  );
});
