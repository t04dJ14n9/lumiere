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

test("Ctrl/Cmd+A is selectAll; Ctrl/Cmd+X is cut", () => {
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

test("keepEditKeys owns Select All and Cut-with-selection; empty Cut yields", () => {
  const calls: string[] = [];
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

  const stop = keepEditKeys(doc, {
    selectAll: () => calls.push("selectAll"),
    cut: () => {
      calls.push("cut");
      return true;
    },
  });

  const listener = (doc as unknown as { _listener: (e: KeyboardEvent) => void })
    ._listener;

  const fire = (init: Partial<KeyboardEvent>) => {
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
  };

  fire({ key: "a" });
  fire({ key: "x" });
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
  ]);
});

test("keepEditKeys leaves empty-selection Cut for vim decrement", () => {
  const calls: string[] = [];
  const doc = {
    defaultView: { navigator: { platform: "Linux" } },
    addEventListener(_type: string, listener: (event: KeyboardEvent) => void) {
      (doc as { _listener?: typeof listener })._listener = listener;
    },
    removeEventListener() {},
  } as unknown as Document;

  keepEditKeys(doc, {
    selectAll: () => calls.push("selectAll"),
    cut: () => {
      calls.push("cut-miss");
      return false;
    },
  });
  const listener = (doc as unknown as { _listener: (e: KeyboardEvent) => void })
    ._listener;
  listener({
    key: "x",
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
  } as unknown as KeyboardEvent);
  assert.deepEqual(calls, ["cut-miss"]);
});

test("keepEditKeys leaves table cell editors for nested CM Select All", () => {
  const calls: string[] = [];
  const doc = {
    defaultView: { navigator: { platform: "Linux" } },
    addEventListener(_type: string, listener: (event: KeyboardEvent) => void) {
      (doc as { _listener?: typeof listener })._listener = listener;
    },
    removeEventListener() {},
  } as unknown as Document;

  keepEditKeys(doc, {
    selectAll: () => calls.push("selectAll"),
    cut: () => {
      calls.push("cut");
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
  listener({
    key: "a",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: cell,
    preventDefault() {
      calls.push("prevent");
    },
    stopPropagation() {
      calls.push("stop");
    },
    stopImmediatePropagation() {
      calls.push("stopImmediate");
    },
  } as unknown as KeyboardEvent);
  assert.deepEqual(calls, []);
});
