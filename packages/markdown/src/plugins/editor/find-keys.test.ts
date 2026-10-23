import test from "node:test";
import assert from "node:assert/strict";
import {
  findActionFor,
  keepFindKey,
  type FindKey,
} from "./find-keys";

const key = (overrides: Partial<FindKey> = {}): FindKey => ({
  key: "f",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

test("Ctrl/Cmd+F is Find; Ctrl/Cmd+H is Replace; other chords are not", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    assert.equal(findActionFor(key({ ...modifier }), isMac), "find");
    assert.equal(findActionFor(key({ ...modifier, key: "F" }), isMac), "find");
    assert.equal(
      findActionFor(key({ ...modifier, key: "а", keyCode: 70 }), isMac),
      "find",
    );
    assert.equal(
      findActionFor(key({ ...modifier, key: "h" }), isMac),
      "replace",
    );
    assert.equal(
      findActionFor(key({ ...modifier, key: "H" }), isMac),
      "replace",
    );
    assert.equal(
      findActionFor(key({ ...modifier, key: "а", keyCode: 72 }), isMac),
      "replace",
    );
    for (const override of [
      { altKey: true },
      { shiftKey: true },
      { ctrlKey: true, metaKey: true },
      { ctrlKey: false, metaKey: false },
      { key: "s" },
      { key: "e" },
      { key: "а", keyCode: 69 },
    ]) {
      assert.equal(
        findActionFor(key({ ...modifier, ...override }), isMac),
        undefined,
      );
    }
    assert.equal(
      findActionFor(key({ ctrlKey: isMac, metaKey: !isMac }), isMac),
      undefined,
    );
  }
});

test("capture listener owns Mod+F/H and skips native fields", () => {
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

  const stop = keepFindKey(
    doc,
    (replace) => {
      calls.push(replace ? "replace" : "find");
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
      key: "f",
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
  assert.deepEqual(calls, ["find"]);

  calls.length = 0;
  assert.equal(fire({ key: "h" }).prevented, true);
  assert.deepEqual(calls, ["replace"]);

  calls.length = 0;
  assert.equal(
    fire({ target: { tagName: "INPUT" } as unknown as EventTarget }).prevented,
    false,
  );
  assert.deepEqual(calls, []);

  stop();
  assert.equal(listeners.size, 0);
});

test("missing document is a no-op dispose", () => {
  const stop = keepFindKey(undefined as unknown as Document, () => {
    assert.fail("must not open find without a document");
  });
  stop();
});

test("Vim INSERT Mod+H deletes char instead of opening Replace (BH-045)", () => {
  const calls: string[] = [];
  const listeners = new Map<string, EventListener>();
  const doc = {
    defaultView: { navigator: { platform: "Linux x86_64" } },
    addEventListener(type: string, listener: EventListener, opts?: unknown) {
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

  let insert = true;
  keepFindKey(
    doc,
    (replace) => {
      calls.push(replace ? "replace" : "find");
    },
    () => false,
    {
      isInsertMode: () => insert,
      onInsertCtrlH: () => {
        calls.push("insert-c-h");
      },
    },
  );

  const listener = listeners.get("keydown")!;
  const fire = (key: string) => {
    const event = {
      key,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: null,
      preventDefault() {},
      stopPropagation() {},
    };
    listener(event as unknown as Event);
  };

  fire("h");
  assert.deepEqual(calls, ["insert-c-h"]);

  insert = false;
  calls.length = 0;
  fire("h");
  assert.deepEqual(calls, ["replace"]);

  calls.length = 0;
  fire("f");
  assert.deepEqual(calls, ["find"]);
});
