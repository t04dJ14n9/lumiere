import test from "node:test";
import assert from "node:assert/strict";
import { editActionFor, keepEditKeys, type EditKey } from "./edit-keys";

const key = (overrides: Partial<EditKey>): EditKey => ({
  key: "a",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

test("Ctrl/Cmd+A/X/C/V map to selectAll/cut/copy/paste", () => {
  for (const modifier of [
    { ctrlKey: true, metaKey: false },
    { ctrlKey: false, metaKey: true },
  ] as const) {
    const isMac = modifier.metaKey;
    assert.equal(
      editActionFor(key({ ...modifier, key: "a" }), isMac),
      "selectAll",
    );
    assert.equal(
      editActionFor(key({ ...modifier, key: "A" }), isMac),
      "selectAll",
    );
    assert.equal(
      editActionFor(key({ ...modifier, key: "а", keyCode: 65 }), isMac),
      "selectAll",
    );
    assert.equal(editActionFor(key({ ...modifier, key: "x" }), isMac), "cut");
    assert.equal(editActionFor(key({ ...modifier, key: "X" }), isMac), "cut");
    assert.equal(
      editActionFor(key({ ...modifier, key: "а", keyCode: 88 }), isMac),
      "cut",
    );
    assert.equal(editActionFor(key({ ...modifier, key: "c" }), isMac), "copy");
    assert.equal(editActionFor(key({ ...modifier, key: "C" }), isMac), "copy");
    assert.equal(
      editActionFor(key({ ...modifier, key: "а", keyCode: 67 }), isMac),
      "copy",
    );
    assert.equal(editActionFor(key({ ...modifier, key: "v" }), isMac), "paste");
    assert.equal(editActionFor(key({ ...modifier, key: "V" }), isMac), "paste");
    assert.equal(
      editActionFor(key({ ...modifier, key: "а", keyCode: 86 }), isMac),
      "paste",
    );
  }
});

test("unrelated modifiers and keys are not edit shortcuts", () => {
  assert.equal(
    editActionFor(key({ ctrlKey: true, shiftKey: true }), false),
    undefined,
  );
  assert.equal(
    editActionFor(key({ ctrlKey: true, altKey: true }), false),
    undefined,
  );
  assert.equal(
    editActionFor(key({ ctrlKey: true, key: "b" }), false),
    undefined,
  );
  assert.equal(editActionFor(key({ metaKey: true }), false), undefined);
  assert.equal(editActionFor(key({ ctrlKey: true }), true), undefined);
});

function mockDoc() {
  const doc = {
    defaultView: { navigator: { platform: "Linux" } },
    addEventListener(
      _type: string,
      listener: (event: KeyboardEvent) => void,
      _opts?: boolean,
    ) {
      (doc as { _listener?: typeof listener })._listener = listener;
    },
    removeEventListener() {},
  } as unknown as Document;
  return doc;
}

function fire(
  listener: (e: KeyboardEvent) => void,
  calls: string[],
  init: Partial<KeyboardEvent>,
) {
  const event = {
    key: "a",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: { tagName: "DIV" },
    preventDefault() {
      calls.push("prevent");
    },
    stopPropagation() {
      calls.push("stop");
    },
    stopImmediatePropagation() {
      calls.push("stopImmediate");
    },
    ...init,
  } as unknown as KeyboardEvent;
  listener(event);
}

test("keepEditKeys owns Select All, Cut/Copy-with-selection, and Paste", () => {
  const calls: string[] = [];
  const doc = mockDoc();
  const stop = keepEditKeys(doc, {
    selectAll: () => calls.push("selectAll"),
    cut: () => {
      calls.push("cut");
      return true;
    },
    copy: () => {
      calls.push("copy");
      return true;
    },
    paste: () => {
      calls.push("paste");
      return true;
    },
  });
  const listener = (doc as unknown as { _listener: (e: KeyboardEvent) => void })
    ._listener;

  fire(listener, calls, { key: "a" });
  fire(listener, calls, { key: "x" });
  fire(listener, calls, { key: "c" });
  fire(listener, calls, { key: "v" });
  stop();
  assert.deepEqual(calls, [
    "selectAll",
    "prevent",
    "stop",
    "stopImmediate",
    "cut",
    "prevent",
    "stop",
    "stopImmediate",
    "copy",
    "prevent",
    "stop",
    "stopImmediate",
    "paste",
    "prevent",
    "stop",
    "stopImmediate",
  ]);
});

test("keepEditKeys leaves empty-selection Cut for vim decrement", () => {
  const calls: string[] = [];
  const doc = mockDoc();
  keepEditKeys(doc, {
    selectAll: () => calls.push("selectAll"),
    cut: () => {
      calls.push("cut-miss");
      return false;
    },
    copy: () => {
      calls.push("copy");
      return true;
    },
    paste: () => {
      calls.push("paste");
      return true;
    },
  });
  const listener = (doc as unknown as { _listener: (e: KeyboardEvent) => void })
    ._listener;
  fire(listener, calls, { key: "x" });
  assert.deepEqual(calls, ["cut-miss"]);
});

test("keepEditKeys leaves empty-selection Copy for vim Esc", () => {
  const calls: string[] = [];
  const doc = mockDoc();
  keepEditKeys(doc, {
    selectAll: () => calls.push("selectAll"),
    cut: () => {
      calls.push("cut");
      return true;
    },
    copy: () => {
      calls.push("copy-miss");
      return false;
    },
    paste: () => {
      calls.push("paste");
      return true;
    },
  });
  const listener = (doc as unknown as { _listener: (e: KeyboardEvent) => void })
    ._listener;
  fire(listener, calls, { key: "c" });
  assert.deepEqual(calls, ["copy-miss"]);
});

test("keepEditKeys leaves paste failure for other handlers", () => {
  const calls: string[] = [];
  const doc = mockDoc();
  keepEditKeys(doc, {
    selectAll: () => calls.push("selectAll"),
    cut: () => true,
    copy: () => true,
    paste: () => {
      calls.push("paste-miss");
      return false;
    },
  });
  const listener = (doc as unknown as { _listener: (e: KeyboardEvent) => void })
    ._listener;
  fire(listener, calls, { key: "v" });
  assert.deepEqual(calls, ["paste-miss"]);
});

test("keepEditKeys leaves table cell editors for nested CM Select All", () => {
  const calls: string[] = [];
  const doc = mockDoc();
  keepEditKeys(doc, {
    selectAll: () => calls.push("selectAll"),
    cut: () => {
      calls.push("cut");
      return true;
    },
    copy: () => {
      calls.push("copy");
      return true;
    },
    paste: () => {
      calls.push("paste");
      return true;
    },
  });
  const listener = (doc as unknown as { _listener: (e: KeyboardEvent) => void })
    ._listener;
  const cell = {
    tagName: "DIV",
    closest(selector: string) {
      return selector.includes("table-cell-content") ? cell : null;
    },
  };
  fire(listener, calls, { key: "a", target: cell as unknown as EventTarget });
  fire(listener, calls, { key: "v", target: cell as unknown as EventTarget });
  assert.deepEqual(calls, []);
});
