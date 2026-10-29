import test from "node:test";
import assert from "node:assert/strict";
import {
  cellPointerOffset,
  nearestCellTextOffset,
  wordRangeAtOffset,
} from "./cell-pointer";

test("nearest edge: left of (or on) the text start opens at 0", () => {
  assert.equal(nearestCellTextOffset(6, 10, 20, 80), 0);
  assert.equal(nearestCellTextOffset(6, 20, 20, 80), 0);
});

test("nearest edge: right of the text end opens at the end", () => {
  assert.equal(nearestCellTextOffset(6, 90, 20, 80), 6);
  assert.equal(nearestCellTextOffset(6, 80, 20, 80), 6);
});

test("nearest edge: ties and empty cells prefer the start", () => {
  assert.equal(nearestCellTextOffset(6, 50, 20, 80), 0);
  assert.equal(nearestCellTextOffset(0, 90, 20, 80), 0);
});

test("cellPointerOffset keeps a successful rendered map", () => {
  const element = {
    ownerDocument: { createRange: () => ({ selectNodeContents() {} }) },
    getBoundingClientRect: () => ({
      left: 0,
      right: 100,
      width: 100,
      height: 20,
    }),
  } as unknown as HTMLElement;
  assert.equal(
    cellPointerOffset("Banana", element, { clientX: 1, clientY: 1 }, () => 2),
    2,
  );
});

test("cellPointerOffset falls back to the nearest text edge when map misses", () => {
  const textBounds = { left: 40, right: 100, width: 60, height: 16 };
  const element = {
    ownerDocument: {
      createRange: () => ({
        selectNodeContents() {},
        getBoundingClientRect: () => textBounds,
      }),
    },
    getBoundingClientRect: () => ({
      left: 20,
      right: 120,
      width: 100,
      height: 24,
    }),
  } as unknown as HTMLElement;
  assert.equal(
    cellPointerOffset(
      "Banana",
      element,
      { clientX: 25, clientY: 10 },
      () => undefined,
    ),
    0,
  );
  assert.equal(
    cellPointerOffset(
      "Banana",
      element,
      { clientX: 115, clientY: 10 },
      () => undefined,
    ),
    6,
  );
});

test("cellTextBounds measures non-whitespace text nodes instead of full-width block containers", () => {
  const nodes = [
    {
      data: "Banana",
      rect: { left: 40, right: 86, top: 10, bottom: 26, width: 46, height: 16 },
    },
    {
      data: "\n",
      rect: {
        left: 20,
        right: 200,
        top: 10,
        bottom: 26,
        width: 180,
        height: 16,
      },
    },
  ];
  let idx = -1;
  let selectedNode: (typeof nodes)[number] | undefined;
  const element = {
    ownerDocument: {
      createTreeWalker: () => ({
        nextNode() {
          idx++;
          return idx < nodes.length ? nodes[idx] : null;
        },
        get currentNode() {
          return nodes[idx];
        },
      }),
      createRange: () => ({
        selectNodeContents(node: unknown) {
          selectedNode = node as (typeof nodes)[number];
        },
        getBoundingClientRect: () =>
          selectedNode?.rect ?? {
            left: 20,
            right: 200,
            top: 10,
            bottom: 26,
            width: 180,
            height: 16,
          },
      }),
    },
    getBoundingClientRect: () => ({
      left: 20,
      right: 200,
      width: 180,
      height: 24,
    }),
  } as unknown as HTMLElement;
  assert.equal(
    cellPointerOffset(
      "Banana",
      element,
      { clientX: 120, clientY: 18 },
      () => undefined,
    ),
    6,
  );
});

test("wordRangeAtOffset selects the word around a double-click offset", () => {
  assert.deepEqual(wordRangeAtOffset("first cell note", 7), {
    anchor: 6,
    head: 10,
  });
  assert.deepEqual(wordRangeAtOffset("Banana", 0), { anchor: 0, head: 6 });
  assert.deepEqual(wordRangeAtOffset("Banana", 6), { anchor: 0, head: 6 });
  assert.deepEqual(wordRangeAtOffset("", 0), { anchor: 0, head: 0 });
});
