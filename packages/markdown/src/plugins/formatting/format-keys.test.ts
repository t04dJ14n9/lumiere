import test from "node:test";
import assert from "node:assert/strict";
import { formatActionFor, keepFormatKeys, type FormatKey } from "./format-keys";

const key = (overrides: Partial<FormatKey> = {}): FormatKey => ({
  key: "b",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

test("Ctrl/Cmd+B is bold; Ctrl/Cmd+I is italics", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    assert.equal(formatActionFor(key({ ...modifier }), isMac), "bold");
    assert.equal(
      formatActionFor(key({ ...modifier, key: "B" }), isMac),
      "bold",
    );
    assert.equal(
      formatActionFor(key({ ...modifier, key: "а", keyCode: 66 }), isMac),
      "bold",
    );
    assert.equal(
      formatActionFor(key({ ...modifier, key: "i" }), isMac),
      "italics",
    );
    assert.equal(
      formatActionFor(key({ ...modifier, key: "I" }), isMac),
      "italics",
    );
    assert.equal(
      formatActionFor(key({ ...modifier, key: "а", keyCode: 73 }), isMac),
      "italics",
    );
    for (const override of [
      { altKey: true },
      { shiftKey: true },
      { ctrlKey: true, metaKey: true },
      { ctrlKey: false, metaKey: false },
      { key: "f" },
      { key: "а", keyCode: 70 },
    ]) {
      assert.equal(
        formatActionFor(key({ ...modifier, ...override }), isMac),
        undefined,
      );
    }
  }
});

test("capture listener owns Mod+B/I and skips native fields", () => {
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

  const stop = keepFormatKeys(
    doc,
    (action) => {
      calls.push(action);
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
    const event = {
      key: "b",
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

  assert.equal(fire({}).prevented, true);
  assert.deepEqual(calls, ["bold"]);

  calls.length = 0;
  assert.equal(fire({ key: "i" }).prevented, true);
  assert.deepEqual(calls, ["italics"]);

  calls.length = 0;
  assert.equal(
    fire({ target: { tagName: "INPUT" } as unknown as EventTarget }).prevented,
    false,
  );
  assert.deepEqual(calls, []);

  stop();
  assert.equal(listeners.size, 0);
});
