import test from "node:test";
import assert from "node:assert/strict";
import { handOffKey } from "../../../src/plugins/cursorBridge/webview";

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
