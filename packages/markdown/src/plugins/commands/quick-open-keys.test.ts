import test from "node:test";
import assert from "node:assert/strict";
import {
  isQuickOpenKey,
  keepQuickOpenKey,
  type QuickOpenKey,
} from "./quick-open-keys";

const key = (overrides: Partial<QuickOpenKey> = {}): QuickOpenKey => ({
  key: "p",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

test("Ctrl/Cmd+P is Quick Open; other modifiers and keys are not", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    assert.equal(isQuickOpenKey(key({ ...modifier }), isMac), true);
    assert.equal(isQuickOpenKey(key({ ...modifier, key: "P" }), isMac), true);
    assert.equal(
      isQuickOpenKey(key({ ...modifier, key: "з", keyCode: 80 }), isMac),
      true,
    );
    for (const override of [
      { altKey: true },
      { shiftKey: true },
      { ctrlKey: true, metaKey: true },
      { ctrlKey: false, metaKey: false },
      { key: "s" },
      { key: "e" },
      { key: "з", keyCode: 69 },
    ]) {
      assert.equal(
        isQuickOpenKey(key({ ...modifier, ...override }), isMac),
        false,
      );
    }
    assert.equal(
      isQuickOpenKey(key({ ctrlKey: isMac, metaKey: !isMac }), isMac),
      false,
    );
  }
});

test("capture prefers suggest when trySuggest returns true", () => {
  const calls: string[] = [];
  const listeners = new Map<string, EventListener>();
  let suggestHandles = false;
  const doc = {
    defaultView: { navigator: { platform: "Linux x86_64" } },
    addEventListener(type: string, listener: EventListener, opts?: unknown) {
      assert.equal(type, "keydown");
      assert.equal(opts, true);
      listeners.set(type, listener);
    },
    removeEventListener(type: string, listener: EventListener, opts?: unknown) {
      assert.equal(opts, true);
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
  } as unknown as Document;

  const stop = keepQuickOpenKey(
    doc,
    () => {
      calls.push("quickOpen");
    },
    (target) =>
      Boolean(
        target &&
        typeof target === "object" &&
        "tagName" in target &&
        String((target as { tagName?: string }).tagName).toUpperCase() ===
          "INPUT",
      ),
    () => suggestHandles,
  );

  const listener = listeners.get("keydown");
  assert.ok(listener);

  const fire = (init: Partial<KeyboardEvent> & { target?: EventTarget }) => {
    let prevented = false;
    const event = {
      key: "p",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: null as EventTarget | null,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {},
      ...init,
    };
    listener!(event as unknown as Event);
    return { prevented };
  };

  assert.deepEqual(fire({}).prevented, true);
  assert.deepEqual(calls, ["quickOpen"]);

  calls.length = 0;
  suggestHandles = true;
  assert.equal(fire({}).prevented, true);
  assert.deepEqual(calls, []);

  calls.length = 0;
  suggestHandles = false;
  assert.equal(
    fire({ target: { tagName: "INPUT" } as unknown as EventTarget }).prevented,
    false,
  );
  assert.deepEqual(calls, []);

  stop();
  assert.equal(listeners.size, 0);
});
