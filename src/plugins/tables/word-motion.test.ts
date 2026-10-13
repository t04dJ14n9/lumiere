import test from "node:test";
import assert from "node:assert/strict";
import { tableWordTarget, type WordMotion } from "./word-motion";

const cells = [
  ["每个环境共用", "next word"],
  ["", "last,value"],
];
const target = (
  motion: WordMotion,
  row: number,
  column: number,
  head: number,
  count = 1,
) => tableWordTarget({ cells, current: { row, column, head }, motion, count });

test("word starts cross CJK cell ends and wrap rows in both directions", () => {
  for (const motion of ["w", "W"] as const) {
    assert.deepEqual(target(motion, 0, 0, 0), { row: 0, column: 1, head: 0 });
    assert.deepEqual(target(motion, 0, 0, 5), { row: 0, column: 1, head: 0 });
    assert.deepEqual(target(motion, 0, 1, 5), { row: 1, column: 1, head: 0 });
  }
  assert.deepEqual(target("b", 1, 1, 0), { row: 0, column: 1, head: 5 });
  assert.deepEqual(target("b", 0, 1, 0), { row: 0, column: 0, head: 0 });
});

test("word ends cross cells only after reaching the current word end", () => {
  assert.deepEqual(target("e", 0, 0, 0), { row: 0, column: 0, head: 5 });
  assert.deepEqual(target("e", 0, 0, 5), { row: 0, column: 1, head: 3 });
  assert.deepEqual(target("ge", 0, 1, 2), { row: 0, column: 0, head: 5 });
  assert.deepEqual(target("ge", 1, 1, 0), { row: 0, column: 1, head: 8 });
});

test("counts span cells; small words separate punctuation and WORDs retain it", () => {
  assert.deepEqual(target("w", 0, 0, 0, 4), { row: 1, column: 1, head: 4 });
  assert.deepEqual(target("W", 0, 0, 0, 4), { row: 1, column: 1, head: 9 });
  assert.deepEqual(target("b", 1, 1, 5, 3), { row: 0, column: 1, head: 5 });
  assert.deepEqual(target("E", 1, 1, 0), { row: 1, column: 1, head: 9 });
  assert.deepEqual(target("gE", 1, 1, 9), { row: 0, column: 1, head: 8 });
});

test("Unicode words retain CJK, accented and mixed letters; graphemes stay whole", () => {
  const unicode = [["每个环境共用 hello中文 café", "😀😀 𠮷野家"]];
  const move = (head: number, motion: WordMotion) =>
    tableWordTarget({
      cells: unicode,
      current: { row: 0, column: 0, head },
      motion,
    });
  assert.deepEqual(move(0, "w"), { row: 0, column: 0, head: 7 });
  assert.deepEqual(move(7, "w"), { row: 0, column: 0, head: 15 });
  assert.deepEqual(move(15, "w"), { row: 0, column: 1, head: 0 });
  assert.deepEqual(
    tableWordTarget({
      cells: unicode,
      current: { row: 0, column: 1, head: 0 },
      motion: "e",
    }),
    { row: 0, column: 1, head: 2 },
  );
  assert.deepEqual(
    tableWordTarget({
      cells: unicode,
      current: { row: 0, column: 1, head: 5 },
      motion: "e",
    }),
    { row: 0, column: 1, head: 8 },
  );
});

test("table edges clamp without editing or inventing another cell", () => {
  assert.deepEqual(target("b", 0, 0, 0), { row: 0, column: 0, head: 0 });
  assert.deepEqual(target("w", 1, 1, 9), { row: 1, column: 1, head: 9 });
  assert.equal(
    tableWordTarget({
      cells: [[""]],
      current: { row: 0, column: 0, head: 0 },
      motion: "w",
    }),
    undefined,
  );
});

test("combining characters and leading whitespace retain cell offsets", () => {
  const cells = [["  cafe\u0301 fin", "next"]];
  assert.deepEqual(
    tableWordTarget({
      cells,
      current: { row: 0, column: 0, head: 2 },
      motion: "e",
    }),
    { row: 0, column: 0, head: 5 },
  );
  assert.deepEqual(
    tableWordTarget({
      cells,
      current: { row: 0, column: 0, head: 5 },
      motion: "w",
    }),
    { row: 0, column: 0, head: 8 },
  );
  assert.deepEqual(
    tableWordTarget({
      cells,
      current: { row: 0, column: 0, head: 8 },
      motion: "w",
    }),
    { row: 0, column: 1, head: 0 },
  );
});

test("mixed empty edge cells never reverse the requested motion", () => {
  for (const motion of ["w", "W", "e", "E", "b", "B", "ge", "gE"] as const) {
    const forward = ["w", "W", "e", "E"].includes(motion);
    const cells = forward ? [["alpha", ""]] : [["", "beta"]];
    const current = { row: 0, column: forward ? 1 : 0, head: 0 };
    for (const count of [1, 9]) {
      assert.deepEqual(
        tableWordTarget({ cells, current, motion, count }),
        current,
      );
    }
  }
});

test("retained whitespace stays put past the word edge but clamps when still ahead", () => {
  for (const motion of ["w", "W", "e", "E"] as const) {
    const cells = [["alpha  "]];
    const current = { row: 0, column: 0, head: 6 };
    assert.deepEqual(tableWordTarget({ cells, current, motion }), current);
    assert.deepEqual(
      tableWordTarget({
        cells,
        current: { ...current, head: 0 },
        motion,
        count: 9,
      }),
      { ...current, head: 4 },
    );
  }
  for (const motion of ["b", "B", "ge", "gE"] as const) {
    const current = { row: 0, column: 0, head: 0 };
    assert.deepEqual(
      tableWordTarget({ cells: [["  beta"]], current, motion }),
      current,
    );
    assert.deepEqual(
      tableWordTarget({
        cells: [["  beta"]],
        current: { ...current, head: 5 },
        motion,
        count: 9,
      }),
      { ...current, head: 2 },
    );
  }
});
