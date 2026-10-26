import test from "node:test";
import assert from "node:assert/strict";
import { TableWheelGate, tableForwardsWheel } from "./wheel-gate";

test("wheel forwarding stays off while hovering or editing a cell", () => {
  assert.equal(
    tableForwardsWheel({
      cellOpen: false,
      gridRange: false,
      rootFocused: false,
    }),
    false,
  );
  assert.equal(
    tableForwardsWheel({
      cellOpen: true,
      gridRange: false,
      rootFocused: false,
    }),
    false,
  );
  assert.equal(
    tableForwardsWheel({
      cellOpen: true,
      gridRange: true,
      rootFocused: true,
    }),
    false,
  );
  assert.equal(
    tableForwardsWheel({
      cellOpen: false,
      gridRange: true,
      rootFocused: false,
    }),
    true,
  );
  assert.equal(
    tableForwardsWheel({
      cellOpen: false,
      gridRange: false,
      rootFocused: true,
    }),
    true,
  );
});

test("the non-passive wheel listener exists only while forwarding is on", () => {
  const listeners: {
    fn: EventListener;
    options?: AddEventListenerOptions;
  }[] = [];
  const root = {
    addEventListener(
      _type: string,
      fn: EventListener,
      options?: AddEventListenerOptions,
    ) {
      listeners.push({ fn, options });
    },
    removeEventListener(_type: string, fn: EventListener) {
      const index = listeners.findIndex((entry) => entry.fn === fn);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
  } as unknown as HTMLElement;
  let forward = false;
  const events = new AbortController();
  const gate = new TableWheelGate(root, events.signal, {
    viewport: () => ({ clientHeight: 100 }) as HTMLElement,
    lineHeight: () => 20,
    scrollNote: () => false,
    shouldForward: () => forward,
  });
  gate.sync();
  assert.equal(listeners.length, 0);
  forward = true;
  gate.sync();
  gate.sync();
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0]?.options?.passive, false);
  forward = false;
  gate.sync();
  assert.equal(listeners.length, 0);
  forward = true;
  gate.sync();
  events.abort();
  assert.equal(listeners.length, 0);
});
