import test from "node:test";
import assert from "node:assert/strict";
import {
  handOffKey,
  keepCursorKeysInEditor,
} from "../../../src/plugins/cursorBridge/webview";

for (const isMac of [false, true]) {
  test(`Cursor shortcuts claim Chat and Edit before Vim on ${isMac ? "macOS" : "Windows/Linux"}`, () => {
    const handed: string[] = [];
    for (const key of ["l", "k"]) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), {
        key,
        ctrlKey: !isMac,
        metaKey: isMac,
        altKey: false,
        shiftKey: false,
      });
      assert.equal(
        handOffKey(
          event as unknown as KeyboardEvent,
          (mode) => handed.push(mode),
          isMac,
        ),
        true,
      );
      assert.equal(event.defaultPrevented, true);
      assert.equal(event.cancelBubble, true);
    }
    assert.deepEqual(handed, ["chat", "edit"]);
    for (const overrides of [
      { key: "o" },
      { shiftKey: true },
      { altKey: true },
      { ctrlKey: isMac, metaKey: !isMac },
    ]) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), {
        key: "k",
        ctrlKey: !isMac,
        metaKey: isMac,
        altKey: false,
        shiftKey: false,
        ...overrides,
      });
      assert.equal(
        handOffKey(
          event as unknown as KeyboardEvent,
          () => assert.fail("unexpected handoff"),
          isMac,
        ),
        false,
      );
      assert.equal(event.defaultPrevented, false);
    }
  });
}

test("capture-phase guard claims Ctrl/Cmd+L and Ctrl/Cmd+K inside the editor", () => {
  const listeners = new Map<
    string,
    { listener: (event: KeyboardEvent) => void; capture: boolean }
  >();
  const content = { tagName: "DIV" };
  const document = {
    addEventListener(
      type: string,
      listener: (event: KeyboardEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ) {
      const capture =
        options === true ||
        (typeof options === "object" && options.capture === true);
      listeners.set(type, { listener, capture });
    },
    removeEventListener(
      type: string,
      listener: (event: KeyboardEvent) => void,
      options?: boolean | EventListenerOptions,
    ) {
      const capture =
        options === true ||
        (typeof options === "object" && options.capture === true);
      const entry = listeners.get(type);
      if (entry?.listener === listener && entry.capture === capture) {
        listeners.delete(type);
      }
    },
  };
  const view = {
    dom: {
      ownerDocument: document,
      contains(node: unknown) {
        return node === content || node === this;
      },
    },
  };
  const handed: string[] = [];
  const dispose = keepCursorKeysInEditor(
    view as never,
    (mode) => handed.push(mode),
    false,
  );
  const entry = listeners.get("keydown");
  assert.ok(entry?.capture);
  let prevented = 0;
  let stopped = 0;
  const fire = (key: string, target: unknown = content) => {
    entry!.listener({
      key,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target,
      preventDefault() {
        prevented++;
      },
      stopPropagation() {
        stopped++;
      },
    } as unknown as KeyboardEvent);
  };
  fire("l");
  fire("k");
  fire("o");
  assert.deepEqual(handed, ["chat", "edit"]);
  assert.equal(prevented, 2);
  assert.equal(stopped, 2);
  dispose();
  assert.equal(listeners.size, 0);
});

test("capture-phase guard leaves INPUT/TEXTAREA and outside-editor targets alone", () => {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const content = { tagName: "DIV" };
  const outside = { tagName: "DIV" };
  const document = {
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
  };
  const view = {
    dom: {
      ownerDocument: document,
      contains(node: unknown) {
        return node === content;
      },
    },
  };
  const handed: string[] = [];
  keepCursorKeysInEditor(view as never, (mode) => handed.push(mode), false);
  const targets: unknown[] = [
    { tagName: "INPUT" },
    { tagName: "TEXTAREA" },
    outside,
  ];
  for (const listener of listeners) {
    for (const target of targets) {
      for (const key of ["l", "k"]) {
        listener({
          key,
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          target,
          preventDefault() {
            assert.fail("must not claim outside the note editor");
          },
          stopPropagation() {
            assert.fail("must not claim outside the note editor");
          },
        } as unknown as KeyboardEvent);
      }
    }
  }
  assert.deepEqual(handed, []);
});
