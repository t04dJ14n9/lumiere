import test from "node:test";
import assert from "node:assert/strict";
import { noteTookTableFocus, resumeRetainedCell } from "./focus-lifetime";

test("detaching a table for scroll is not the user leaving it", () => {
  const outside = {} as Node;
  const inside = {} as Node;
  const root = {
    isConnected: false,
    contains(node: Node | null) {
      return node === inside;
    },
  };
  assert.equal(noteTookTableFocus(root, outside), false);
  root.isConnected = true;
  assert.equal(noteTookTableFocus(root, inside), false);
  assert.equal(noteTookTableFocus(root, outside), true);
  assert.equal(noteTookTableFocus(root, null), true);
});

test("a retained cell is focused only after it is connected and the note is not", async () => {
  let focused = 0;
  const content = {
    isConnected: false,
    focus() {
      focused += 1;
    },
  };
  const root = {
    classList: { add() {} },
  } as unknown as HTMLElement;
  const outer = { hasFocus: false };
  resumeRetainedCell(
    root,
    outer,
    { contentDOM: content as unknown as HTMLElement },
    false,
  );
  resumeRetainedCell(
    root,
    { hasFocus: true },
    {
      contentDOM: content as unknown as HTMLElement,
    },
    true,
  );
  await Promise.resolve();
  assert.equal(focused, 0);
  resumeRetainedCell(
    root,
    outer,
    { contentDOM: content as unknown as HTMLElement },
    true,
  );
  await Promise.resolve();
  assert.equal(focused, 0, "focus waits until the widget is in the document");
  content.isConnected = true;
  resumeRetainedCell(
    root,
    outer,
    { contentDOM: content as unknown as HTMLElement },
    true,
  );
  await Promise.resolve();
  assert.equal(focused, 1);
  assert.equal(content.isConnected, true);
});
