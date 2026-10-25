import test from "node:test";
import assert from "node:assert/strict";
import {
  isToggleTextEditorKey,
  keepToggleTextEditorKey,
  type ToggleTextEditorKey,
} from "./toggle-text-editor-keys";

const key = (
  overrides: Partial<ToggleTextEditorKey> = {},
): ToggleTextEditorKey => ({
  key: "e",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

test("Ctrl/Cmd+E is the toggle; other modifiers and keys are not", () => {
  for (const isMac of [false, true]) {
    const modifier = { ctrlKey: !isMac, metaKey: isMac };
    assert.equal(isToggleTextEditorKey(key({ ...modifier }), isMac), true);
    assert.equal(
      isToggleTextEditorKey(key({ ...modifier, key: "E" }), isMac),
      true,
    );
    assert.equal(
      isToggleTextEditorKey(key({ ...modifier, key: "у", keyCode: 69 }), isMac),
      true,
    );
    for (const override of [
      { altKey: true },
      { shiftKey: true },
      { ctrlKey: true, metaKey: true },
      { ctrlKey: false, metaKey: false },
      { key: "s" },
      { key: "p" },
      { key: "у", keyCode: 80 },
    ]) {
      assert.equal(
        isToggleTextEditorKey(key({ ...modifier, ...override }), isMac),
        false,
      );
    }
    assert.equal(
      isToggleTextEditorKey(key({ ctrlKey: isMac, metaKey: !isMac }), isMac),
      false,
    );
  }
});

test("capture listener owns Mod+E and skips native fields", () => {
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

  const stop = keepToggleTextEditorKey(
    doc,
    () => {
      calls.push("toggle");
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
      key: "e",
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
  assert.deepEqual(calls, ["toggle"]);
  assert.equal(result.prevented, true);
  assert.equal(result.stopped, true);

  result = fire({ target: { tagName: "INPUT" } as unknown as EventTarget });
  assert.deepEqual(calls, ["toggle"]);
  assert.equal(result.prevented, false);

  result = fire({ key: "p" });
  assert.deepEqual(calls, ["toggle"]);
  assert.equal(result.prevented, false);

  stop();
  assert.equal(listeners.size, 0);
});
