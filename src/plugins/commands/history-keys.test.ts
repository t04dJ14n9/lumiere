import test from "node:test";
import assert from "node:assert/strict";
import {
  historyActionFor,
  isNativeTextField,
  keepHistoryKeysInEditor,
  type HistoryKey,
} from "./history-keys";

const key = (overrides: Partial<HistoryKey> = {}): HistoryKey => ({
  key: "z",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

test("Mod/Ctrl+Z undoes and Mod/Ctrl+Shift+Z or Mod/Ctrl+Y redoes", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    assert.equal(historyActionFor(key({ ...modifier }), isMac), "undo");
    assert.equal(
      historyActionFor(key({ ...modifier, key: "Z", shiftKey: true }), isMac),
      "redo",
    );
    assert.equal(
      historyActionFor(key({ ...modifier, key: "y" }), isMac),
      "redo",
    );
    assert.equal(
      historyActionFor(key({ ...modifier, key: "я", keyCode: 90 }), isMac),
      "undo",
    );
    assert.equal(
      historyActionFor(
        key({ ...modifier, key: "Я", keyCode: 90, shiftKey: true }),
        isMac,
      ),
      "redo",
    );
    assert.equal(
      historyActionFor(key({ ...modifier, key: "н", keyCode: 89 }), isMac),
      "redo",
    );
  }
});

test("unrelated modifiers and keys are not history shortcuts", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    for (const override of [
      { altKey: true },
      { ctrlKey: true, metaKey: true },
      { ctrlKey: false, metaKey: false },
      { key: "y", shiftKey: true },
      { key: "Н", keyCode: 89, shiftKey: true },
      { key: "s" },
      { key: "a" },
      { key: "r" },
    ]) {
      assert.equal(
        historyActionFor(key({ ...modifier, ...override }), isMac),
        undefined,
      );
    }
    assert.equal(
      historyActionFor(key({ ctrlKey: isMac, metaKey: !isMac }), isMac),
      undefined,
    );
  }
});

test("native text fields are left to VS Code's DOM undo", () => {
  assert.equal(isNativeTextField(null), false);
  assert.equal(isNativeTextField({ tagName: "DIV" } as EventTarget), false);
  assert.equal(isNativeTextField({ tagName: "input" } as EventTarget), true);
  assert.equal(isNativeTextField({ tagName: "TEXTAREA" } as EventTarget), true);
});

test("capture-phase history guard owns undo once and releases its listener", () => {
  type Entry = {
    listener: (event: KeyboardEvent) => void;
    capture: boolean;
  };
  const listeners = new Map<string, Entry>();
  const document = {
    defaultView: { navigator: { platform: "Linux x86_64" } },
    addEventListener(
      type: string,
      listener: (event: KeyboardEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ) {
      assert.equal(type, "keydown");
      const capture =
        options === true ||
        (typeof options === "object" && options.capture === true);
      assert.equal(capture, true);
      listeners.set(type, { listener, capture });
    },
    removeEventListener(
      type: string,
      listener: (event: KeyboardEvent) => void,
      options?: boolean | EventListenerOptions,
    ) {
      assert.equal(type, "keydown");
      const capture =
        options === true ||
        (typeof options === "object" && options.capture === true);
      assert.equal(capture, true);
      const entry = listeners.get(type);
      if (entry?.listener === listener) {
        listeners.delete(type);
      }
    },
  } as unknown as Document;
  const actions: string[] = [];
  const dispose = keepHistoryKeysInEditor(document, (action) => {
    actions.push(action);
  });
  const entry = listeners.get("keydown");
  assert.ok(entry);
  let prevented = 0;
  let stopped = 0;
  const fire = (overrides: Partial<HistoryKey> = {}) => {
    entry.listener({
      ...key(overrides),
      target: { tagName: "DIV" } as EventTarget,
      preventDefault() {
        prevented++;
      },
      stopPropagation() {
        stopped++;
      },
    } as KeyboardEvent);
  };
  fire();
  fire({ key: "Z", shiftKey: true });
  fire({ key: "s" });
  assert.deepEqual(actions, ["undo", "redo"]);
  assert.equal(prevented, 2);
  assert.equal(stopped, 2);
  dispose();
  assert.equal(listeners.size, 0);
});

test("history guard does not steal undo from INPUT or TEXTAREA", () => {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const document = {
    defaultView: { navigator: { platform: "MacIntel" } },
    addEventListener(
      type: string,
      listener: (event: KeyboardEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ) {
      assert.equal(type, "keydown");
      assert.equal(options, true);
      listeners.add(listener);
    },
    removeEventListener() {},
  } as unknown as Document;
  const actions: string[] = [];
  keepHistoryKeysInEditor(document, (action) => {
    actions.push(action);
  });
  for (const listener of listeners) {
    for (const tagName of ["INPUT", "TEXTAREA"]) {
      listener({
        ...key({ metaKey: true, ctrlKey: false }),
        target: { tagName } as EventTarget,
        preventDefault() {
          assert.fail("must not preventDefault in a text field");
        },
        stopPropagation() {
          assert.fail("must not stopPropagation in a text field");
        },
      } as KeyboardEvent);
    }
  }
  assert.deepEqual(actions, []);
});
