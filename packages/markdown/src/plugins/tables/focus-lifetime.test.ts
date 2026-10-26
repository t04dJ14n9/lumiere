import test from "node:test";
import assert from "node:assert/strict";
import {
  bindTableFocus,
  noteTookTableFocus,
  resumeRetainedCell,
} from "./focus-lifetime";

async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await Promise.resolve();
  }
}

test("focus in the note leaves the table, even one unmounted off screen", async () => {
  const cell = {} as Node;
  const ownerDocument = { activeElement: null as unknown };
  const root = Object.assign(new EventTarget(), {
    isConnected: false,
    ownerDocument,
    classList: { add() {}, remove() {} },
    contains: (node: unknown) => node === cell,
  });
  const contentDOM = new EventTarget();
  let cleared = 0;
  bindTableFocus({
    root: root as unknown as HTMLElement,
    contentDOM: contentDOM as unknown as HTMLElement,
    signal: new AbortController().signal,
    clear: () => cleared++,
  });

  // The unmount itself blurs the table and leaves focus on the body.
  root.dispatchEvent(new Event("focusout"));
  await settle();
  assert.equal(cleared, 0, "scrolling a table away is not leaving it");

  // A command that hands focus back to the cell within the turn keeps it.
  ownerDocument.activeElement = contentDOM;
  contentDOM.dispatchEvent(new Event("focusin"));
  ownerDocument.activeElement = cell;
  await settle();
  assert.equal(cleared, 0);

  ownerDocument.activeElement = contentDOM;
  contentDOM.dispatchEvent(new Event("focusin"));
  await settle();
  assert.equal(cleared, 1, "a click into the note leaves the unmounted table");
});

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
