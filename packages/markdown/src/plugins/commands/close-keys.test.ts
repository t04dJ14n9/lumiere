import test from "node:test";
import assert from "node:assert/strict";
import { isCloseKey, keepCloseKey, type CloseKey } from "./close-keys";

const key = (overrides: Partial<CloseKey> = {}): CloseKey => ({
  key: "w",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

test("Ctrl/Cmd+W is Close; other modifiers and keys are not", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    assert.equal(isCloseKey(key({ ...modifier }), isMac), true);
    assert.equal(isCloseKey(key({ ...modifier, key: "W" }), isMac), true);
    assert.equal(
      isCloseKey(key({ ...modifier, key: "ц", keyCode: 87 }), isMac),
      true,
    );
    for (const override of [
      { altKey: true },
      { shiftKey: true },
      { ctrlKey: true, metaKey: true },
      { ctrlKey: false, metaKey: false },
      { key: "s" },
      { key: "e" },
      { key: "ц", keyCode: 69 },
    ]) {
      assert.equal(isCloseKey(key({ ...modifier, ...override }), isMac), false);
    }
    assert.equal(
      isCloseKey(key({ ctrlKey: isMac, metaKey: !isMac }), isMac),
      false,
    );
  }
});

test("capture listener owns Mod+W and skips native fields", () => {
  const calls: string[] = [];
  const listeners = new Map<string, EventListener>();
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

  const stop = keepCloseKey(
    doc,
    () => {
      calls.push("close");
    },
    (target) =>
      Boolean(
        target &&
        typeof target === "object" &&
        "tagName" in target &&
        String((target as { tagName?: string }).tagName).toUpperCase() ===
          "INPUT",
      ),
  );

  const listener = listeners.get("keydown");
  assert.ok(listener);

  const fire = (init: Partial<KeyboardEvent> & { target?: EventTarget }) => {
    let prevented = false;
    let stopped = false;
    const event = {
      key: "w",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: null as EventTarget | null,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
      ...init,
    };
    listener!(event as unknown as Event);
    return { prevented, stopped };
  };

  let result = fire({});
  assert.deepEqual(calls, ["close"]);
  assert.equal(result.prevented, true);
  assert.equal(result.stopped, true);

  result = fire({ target: { tagName: "INPUT" } as unknown as EventTarget });
  assert.deepEqual(calls, ["close"]);
  assert.equal(result.prevented, false);

  result = fire({ key: "e" });
  assert.deepEqual(calls, ["close"]);
  assert.equal(result.prevented, false);

  stop();
  assert.equal(listeners.size, 0);
});
