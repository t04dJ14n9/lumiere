import test from "node:test";
import assert from "node:assert/strict";
import {
  isNativeSelectionOpen,
  nativeOpeningSelection,
  withNativeSelectionOpen,
} from "../../../src/host/native-selection-open";

test("a Search range stays visible until the custom editor open finishes", async () => {
  const range = { at: 9, to: 34 };
  let during: { anchor: number; head: number } | undefined;
  await withNativeSelectionOpen(
    "file:///Note.md",
    1,
    () => range,
    async () => {
      during = nativeOpeningSelection("file:///Note.md", 1);
      assert.equal(isNativeSelectionOpen("file:///Note.md", 1), true);
    },
  );
  assert.deepEqual(during, { anchor: 9, head: 34 });
  assert.equal(nativeOpeningSelection("file:///Note.md", 1), undefined);
  assert.equal(isNativeSelectionOpen("file:///Note.md", 1), false);
});

test("a caret does not mark the open as a Search selection", async () => {
  await withNativeSelectionOpen(
    "file:///Note.md",
    1,
    () => ({ at: 0 }),
    async () => {
      assert.equal(isNativeSelectionOpen("file:///Note.md", 1), false);
      assert.equal(nativeOpeningSelection("file:///Note.md", 1), undefined);
    },
  );
});
