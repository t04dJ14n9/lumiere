import test from "node:test";
import assert from "node:assert/strict";
import { addButtonDirection, headingMotionKey } from "./form";

test("headingMotionKey maps Obsidian j to ArrowDown", () => {
  assert.equal(headingMotionKey("j"), "ArrowDown");
  assert.equal(headingMotionKey("ArrowDown"), "ArrowDown");
  assert.equal(headingMotionKey("k"), "k");
  assert.equal(headingMotionKey("Enter"), "Enter");
});

test("addButtonDirection accepts Obsidian j/k like arrows", () => {
  const base = {
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
  };
  assert.equal(addButtonDirection({ ...base, key: "j" }), "forward");
  assert.equal(addButtonDirection({ ...base, key: "ArrowDown" }), "forward");
  assert.equal(addButtonDirection({ ...base, key: "k" }), "backward");
  assert.equal(addButtonDirection({ ...base, key: "ArrowUp" }), "backward");
  assert.equal(
    addButtonDirection({ ...base, key: "Tab", shiftKey: true }),
    "backward",
  );
  assert.equal(addButtonDirection({ ...base, key: "o" }), undefined);
  assert.equal(
    addButtonDirection({ ...base, key: "j", ctrlKey: true }),
    undefined,
  );
});
