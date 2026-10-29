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

test("a retained cell is focused only once connected, and only if nothing has focus", async () => {
  let focused = 0;
  const content = {
    isConnected: false,
    focus() {
      focused += 1;
    },
  };
  const body = {} as Element;
  const editorRoot = {} as Element;
  const findInput = {} as Element;
  const ownerDocument = {
    activeElement: body as Element | null,
    body,
    documentElement: {} as Element,
  };
  const root = {
    ownerDocument,
    classList: { add() {} },
  } as unknown as HTMLElement;
  const outer = { dom: editorRoot };
  const resume = (isActive = true) =>
    resumeRetainedCell(
      root,
      outer,
      { contentDOM: content as unknown as HTMLElement },
      isActive,
    );
  resume(false);
  await Promise.resolve();
  assert.equal(focused, 0, "an inactive table never takes focus");
  resume();
  await Promise.resolve();
  assert.equal(focused, 0, "focus waits until the widget is in the document");
  content.isConnected = true;
  for (const elsewhere of [findInput, {} as Element]) {
    ownerDocument.activeElement = elsewhere;
    resume();
    await Promise.resolve();
    assert.equal(focused, 0, "the find bar or the note keeps its focus");
  }
  ownerDocument.activeElement = body;
  resume();
  ownerDocument.activeElement = findInput;
  await Promise.resolve();
  assert.equal(focused, 0, "focus taken before the insert is kept too");
  for (const unclaimed of [body, editorRoot, null]) {
    ownerDocument.activeElement = unclaimed;
    resume();
    await Promise.resolve();
  }
  assert.equal(focused, 3);
});

test("shared vim status dialog focus does not leave the table", () => {
  const panel = {
    classList: { contains: (name: string) => name === "cm-vim-panel" },
    closest(selector: string) {
      return selector === ".cm-vim-panel" ? this : null;
    },
  } as unknown as Element;
  const input = {
    closest(selector: string) {
      return selector === ".cm-vim-panel" ? panel : null;
    },
  } as unknown as Element;
  const root = {
    isConnected: true,
    contains(_node: Node | null) {
      return false;
    },
  };
  assert.equal(
    noteTookTableFocus(root, input),
    false,
    "focus in the shared : / / ? bar stays with the cell session",
  );
  assert.equal(
    noteTookTableFocus(root, {} as Node),
    true,
    "ordinary note focus still leaves the table",
  );
});

test("focusout into the shared vim panel does not clear the table", async () => {
  const panel = {
    closest(selector: string) {
      return selector === ".cm-vim-panel" ? this : null;
    },
  } as unknown as Element;
  const ownerDocument = { activeElement: null as unknown };
  const root = Object.assign(new EventTarget(), {
    isConnected: true,
    ownerDocument,
    classList: { add() {}, remove() {} },
    contains: () => false,
  });
  const contentDOM = new EventTarget();
  let cleared = 0;
  bindTableFocus({
    root: root as unknown as HTMLElement,
    contentDOM: contentDOM as unknown as HTMLElement,
    signal: new AbortController().signal,
    clear: () => cleared++,
  });
  ownerDocument.activeElement = panel;
  root.dispatchEvent(new Event("focusout"));
  await settle();
  assert.equal(cleared, 0, "shared status dialog keeps the cell session");
});
