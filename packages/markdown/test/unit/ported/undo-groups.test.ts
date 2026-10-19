import test from "node:test";
import assert from "node:assert/strict";
import { UndoGroups } from "../../../src/plugins/document/undo-groups";

test("logical groups replay native undo steps in both directions", async () => {
  const groups = new UndoGroups();
  const states = ["a", "ab", "abc", "abc!"];
  let index = 3;
  let calls = 0;
  groups.record("a", "ab", "insert");
  groups.record("ab", "abc", "insert");
  groups.record("abc", "abc!", "operator");
  const run = (action: "undo" | "redo") =>
    groups.run(
      action,
      () => states[index]!,
      async () => {
        calls++;
        index += action === "undo" ? -1 : 1;
      },
    );
  await run("undo");
  assert.equal(index, 2);
  await run("undo");
  assert.equal(index, 0);
  await run("redo");
  assert.equal(index, 2);
  assert.equal(calls, 5);
});
test("unexpected native state stops grouped replay rather than undoing unrelated edits", async () => {
  const groups = new UndoGroups();
  groups.record("a", "ab", "insert");
  groups.record("ab", "abc", "insert");
  let state = "abc";
  let calls = 0;
  await groups.run(
    "undo",
    () => state,
    async () => {
      calls++;
      state = "unexpected";
    },
  );
  assert.equal(calls, 1);
});
