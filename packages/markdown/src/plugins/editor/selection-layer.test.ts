import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import { selectionMarkers } from "./selection-layer";

test("an empty selection does not read selection geometry", () => {
  let reads = 0;
  const view = {
    state: {
      selection: { ranges: [{ empty: true, from: 1, to: 1 }] },
    },
    scrollDOM: {
      scrollLeft: 0,
      scrollTop: 0,
      getBoundingClientRect() {
        reads += 1;
        return { left: 0, top: 0 };
      },
    },
    contentDOM: {
      getBoundingClientRect() {
        reads += 1;
        return { left: 0, top: 0, width: 10, height: 10 };
      },
    },
  } as unknown as EditorView;
  assert.deepEqual(selectionMarkers(view), []);
  assert.equal(reads, 0);
});

test("a ranged selection still reads geometry", () => {
  let reads = 0;
  const view = {
    state: {
      selection: { ranges: [{ empty: false, from: 0, to: 4 }] },
    },
    viewportLineBlocks: [],
    scrollDOM: {
      scrollLeft: 0,
      scrollTop: 0,
      getBoundingClientRect() {
        reads += 1;
        return { left: 0, top: 0 };
      },
    },
    contentDOM: {
      getBoundingClientRect() {
        reads += 1;
        return { left: 0, top: 0, width: 10, height: 10 };
      },
    },
  } as unknown as EditorView;
  assert.deepEqual(selectionMarkers(view), []);
  assert.equal(reads, 2);
});
