import test from "node:test";
import assert from "node:assert/strict";
import {
  historyActionFor,
  isNativeTextField,
  isPropertyNativeEditor,
  keepHistoryKeysInEditor,
  leavesNativeHistory,
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
  assert.equal(
    isNativeTextField({ tagName: "DIV" } as unknown as EventTarget),
    false,
  );
  assert.equal(
    isNativeTextField({ tagName: "input" } as unknown as EventTarget),
    true,
  );
  assert.equal(
    isNativeTextField({ tagName: "TEXTAREA" } as unknown as EventTarget),
    true,
  );
});

function propertyEditor(
  attribute: "data-property-input" | "data-property-list-input",
): EventTarget {
  return {
    tagName: "DIV",
    closest(selector: string) {
      return selector.includes(attribute) ? this : null;
    },
  } as unknown as EventTarget;
}

test("property contenteditables leave native history; CodeMirror does not", () => {
  const textProperty = propertyEditor("data-property-input");
  const listDraft = propertyEditor("data-property-list-input");
  const codeMirrorSurface = {
    tagName: "DIV",
    contentEditable: "true",
    closest() {
      return null;
    },
  } as unknown as EventTarget;
  const nestedInProperty = {
    nodeType: 3,
    parentElement: {
      tagName: "DIV",
      closest(selector: string) {
        return selector.includes("data-property-input") ? this : null;
      },
    },
  } as unknown as EventTarget;

  assert.equal(isPropertyNativeEditor(null), false);
  assert.equal(isPropertyNativeEditor(textProperty), true);
  assert.equal(isPropertyNativeEditor(listDraft), true);
  assert.equal(isPropertyNativeEditor(nestedInProperty), true);
  assert.equal(isPropertyNativeEditor(codeMirrorSurface), false);
  assert.equal(leavesNativeHistory(textProperty), true);
  assert.equal(leavesNativeHistory(listDraft), true);
  assert.equal(leavesNativeHistory(codeMirrorSurface), false);
  assert.equal(
    leavesNativeHistory({ tagName: "INPUT" } as unknown as EventTarget),
    true,
  );
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
      target: { tagName: "DIV" } as unknown as EventTarget,
      preventDefault() {
        prevented++;
      },
      stopPropagation() {
        stopped++;
      },
    } as unknown as KeyboardEvent);
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

test("history guard does not steal undo from INPUT, TEXTAREA, or property editors", () => {
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
  const targets: EventTarget[] = [
    { tagName: "INPUT" } as unknown as EventTarget,
    { tagName: "TEXTAREA" } as unknown as EventTarget,
    propertyEditor("data-property-input"),
    propertyEditor("data-property-list-input"),
  ];
  for (const listener of listeners) {
    for (const target of targets) {
      for (const override of [
        { metaKey: true, ctrlKey: false },
        { metaKey: true, ctrlKey: false, key: "Z", shiftKey: true },
        { metaKey: true, ctrlKey: false, key: "y" },
      ]) {
        listener({
          ...key(override),
          target,
          preventDefault() {
            assert.fail("must not preventDefault in a native editor");
          },
          stopPropagation() {
            assert.fail("must not stopPropagation in a native editor");
          },
        } as unknown as KeyboardEvent);
      }
    }
  }
  assert.deepEqual(actions, []);
});

test("history guard still owns undo on CodeMirror contenteditable", () => {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const document = {
    defaultView: { navigator: { platform: "Linux x86_64" } },
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
  const codeMirror = {
    tagName: "DIV",
    contentEditable: "true",
    closest() {
      return null;
    },
  } as unknown as EventTarget;
  let prevented = 0;
  for (const listener of listeners) {
    listener({
      ...key(),
      target: codeMirror,
      preventDefault() {
        prevented++;
      },
      stopPropagation() {},
    } as unknown as KeyboardEvent);
  }
  assert.deepEqual(actions, ["undo"]);
  assert.equal(prevented, 1);
});
