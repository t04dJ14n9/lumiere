import assert from "node:assert/strict";
import test from "node:test";
import { tableMotionPosition } from "./source-motion";

const base = {
  start: { line: 2, ch: 0 },
  amount: 1,
  result: { line: 7, ch: 0 },
  lastLine: 10,
  goalColumn: 3,
  lineLength: () => 17,
  widgets: [{ kind: "Table", from: 3, to: 6 }],
};

test("a rendered table overshoot returns the source line and remembered column for j/k", () => {
  for (const [start, amount, result, line] of [
    [2, 1, 7, 3],
    [1, 3, 9, 4],
    [0, 5, 10, 5],
    [7, -1, 2, 6],
    [8, -2, 1, 6],
    [8, -4, 0, 4],
  ]) {
    assert.deepEqual(
      tableMotionPosition({
        ...base,
        start: { line: start!, ch: 0 },
        amount: amount!,
        result: { line: result!, ch: 0 },
      }),
      { line, ch: 3 },
    );
  }
});

test("the arithmetic target is clamped before comparing overshoot; source columns are clamped to text", () => {
  assert.deepEqual(tableMotionPosition({ ...base, goalColumn: 99 }), {
    line: 3,
    ch: 17,
  });
  assert.deepEqual(tableMotionPosition({ ...base, goalColumn: Infinity }), {
    line: 3,
    ch: 17,
  });
  assert.deepEqual(tableMotionPosition({ ...base, goalColumn: -1 }), {
    line: 3,
    ch: 0,
  });
  assert.deepEqual(tableMotionPosition({ ...base, lineLength: () => 0 }), {
    line: 3,
    ch: 0,
  });
  assert.equal(
    tableMotionPosition({ ...base, amount: 99, result: { line: 10, ch: 0 } }),
    undefined,
  );
  assert.equal(
    tableMotionPosition({
      ...base,
      start: { line: 8, ch: 0 },
      amount: -99,
      result: { line: 0, ch: 0 },
    }),
    undefined,
  );
  // Even an adapter result outside the document cannot return an invalid source line.
  assert.deepEqual(
    tableMotionPosition({ ...base, amount: 99, result: { line: 11, ch: 0 } }),
    { line: 10, ch: 3 },
  );
  assert.deepEqual(
    tableMotionPosition({
      ...base,
      start: { line: 8, ch: 0 },
      amount: -99,
      result: { line: -1, ch: 0 },
    }),
    { line: 0, ch: 3 },
  );
});

test("j and dj preserve a collapsed heading's skip when its table is hidden", () => {
  for (const amount of [1, 2]) {
    assert.equal(
      tableMotionPosition({
        ...base,
        start: { line: 0, ch: 0 },
        amount,
        result: { line: 6 + amount, ch: 0 },
        folds: [{ from: 0, to: 6 }],
        widgets: [],
      }),
      undefined,
    );
  }
});

test("counted source motions crossing a visible table and a separate fold preserve the fold skip in both directions", () => {
  for (const [start, amount, result, line] of [
    [2, 7, 15, 11],
    [14, -7, 1, 5],
  ]) {
    assert.deepEqual(
      tableMotionPosition({
        ...base,
        start: { line: start!, ch: 0 },
        amount: amount!,
        result: { line: result!, ch: 0 },
        lastLine: 20,
        folds: [{ from: 8, to: 10 }],
      }),
      { line, ch: 3 },
    );
  }
});

test("an ordinary fold skip is untouched even with a visible table elsewhere in the motion interval", () => {
  assert.equal(
    tableMotionPosition({
      ...base,
      amount: 7,
      result: { line: 12, ch: 9 },
      lastLine: 20,
      folds: [{ from: 8, to: 11 }],
    }),
    undefined,
  );
});

test("native equal, short, opposite and zero steps are untouched, even when crossing a table", () => {
  for (const [amount, result] of [
    [1, 3],
    [1, 2],
    [1, 0],
    [-1, 1],
    [-1, 2],
    [-1, 5],
    [0, 7],
  ]) {
    assert.equal(
      tableMotionPosition({
        ...base,
        amount: amount!,
        result: { line: result!, ch: 9 },
      }),
      undefined,
    );
  }
});

test("Mermaid, HTML and other widgets keep native motion; a table outside the motion range is ignored", () => {
  for (const kind of ["Mermaid", "HTMLBlock", "math", "properties"]) {
    assert.equal(
      tableMotionPosition({ ...base, widgets: [{ kind, from: 3, to: 6 }] }),
      undefined,
    );
  }
  assert.equal(tableMotionPosition({ ...base, widgets: [] }), undefined);
  assert.equal(
    tableMotionPosition({
      ...base,
      widgets: [{ kind: "Table", from: 8, to: 9 }],
    }),
    undefined,
  );
  assert.equal(
    tableMotionPosition({
      ...base,
      widgets: [{ kind: "Table", from: 0, to: 1 }],
    }),
    undefined,
  );
});
