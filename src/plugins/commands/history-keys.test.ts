import test from "node:test";
import assert from "node:assert/strict";
import {
  isHandledHistoryKey,
  keepHistoryKeysInEditor,
  type HistoryKey,
} from "./history-keys";

const key = (overrides: Partial<HistoryKey> = {}): HistoryKey => ({
  key: "z",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: true,
  ...overrides,
});

test("handled undo and redo stop before a second native history action", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    for (const shortcut of [
      { key: "z" },
      { key: "Z", shiftKey: true },
      { key: "y" },
      { key: "я", keyCode: 90 },
      { key: "Я", keyCode: 90, shiftKey: true },
      { key: "н", keyCode: 89 },
    ]) {
      assert.equal(
        isHandledHistoryKey(key({ ...modifier, ...shortcut }), isMac),
        true,
      );
    }
  }
});

test("unhandled and differently modified shortcuts keep reaching the host", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    for (const override of [
      { defaultPrevented: false },
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
        isHandledHistoryKey(key({ ...modifier, ...override }), isMac),
        false,
      );
    }
    assert.equal(
      isHandledHistoryKey(key({ ctrlKey: isMac, metaKey: !isMac }), isMac),
      false,
    );
  }
});

test("history key guard owns and releases its bubbling document listener", () => {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const document = {
    defaultView: { navigator: { platform: "Linux x86_64" } },
    addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
      assert.equal(type, "keydown");
      listeners.add(listener);
    },
    removeEventListener(
      type: string,
      listener: (event: KeyboardEvent) => void,
    ) {
      assert.equal(type, "keydown");
      listeners.delete(listener);
    },
  } as unknown as Document;
  const dispose = keepHistoryKeysInEditor(document);
  let stopped = 0;
  for (const listener of listeners) {
    listener({
      ...key(),
      stopPropagation() {
        stopped++;
      },
    } as KeyboardEvent);
    listener({
      ...key({ defaultPrevented: false }),
      stopPropagation() {
        stopped++;
      },
    } as KeyboardEvent);
  }
  assert.equal(stopped, 1);
  dispose();
  assert.equal(listeners.size, 0);
});
