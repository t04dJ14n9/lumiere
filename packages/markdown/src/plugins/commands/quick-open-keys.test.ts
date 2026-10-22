import test from "node:test";
import assert from "node:assert/strict";
import {
  isQuickOpenKey,
  keepQuickOpenKey,
  suggestTooltipOpen,
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

test("suggestTooltipOpen detects the autocomplete tooltip", () => {
  const doc = {
    querySelector(sel: string) {
      return sel === ".cm-tooltip-autocomplete" ? {} : null;
    },
  } as unknown as Document;
  assert.equal(suggestTooltipOpen(doc), true);
  const empty = {
    querySelector() {
      return null;
    },
  } as unknown as Document;
  assert.equal(suggestTooltipOpen(empty), false);
});

test("capture listener owns Mod+P, skips native fields and open suggest", () => {
  const calls: string[] = [];
  const listeners = new Map<string, EventListener>();
  let suggest = false;
  const doc = {
    defaultView: { navigator: { platform: "Linux x86_64" } },
    querySelector(sel: string) {
      return suggest && sel === ".cm-tooltip-autocomplete" ? {} : null;
    },
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
    () => suggest,
  );

  const listener = listeners.get("keydown");
  assert.ok(listener);

  const fire = (init: Partial<KeyboardEvent> & { target?: EventTarget }) => {
    let prevented = false;
    let stopped = false;
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
      stopPropagation() {
        stopped = true;
      },
      ...init,
    };
    listener!(event as unknown as Event);
    return { prevented, stopped };
  };

  let result = fire({});
  assert.deepEqual(calls, ["quickOpen"]);
  assert.equal(result.prevented, true);
  assert.equal(result.stopped, true);

  calls.length = 0;
  result = fire({ target: { tagName: "INPUT" } as unknown as EventTarget });
  assert.deepEqual(calls, []);
  assert.equal(result.prevented, false);

  suggest = true;
  result = fire({});
  assert.deepEqual(calls, []);
  assert.equal(result.prevented, false);

  stop();
  assert.equal(listeners.size, 0);
});
