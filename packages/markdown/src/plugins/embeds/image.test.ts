import test from "node:test";
import assert from "node:assert/strict";
import { setMaxListeners } from "node:events";
import { imageControls, savedImageScale } from "./image";
test("image zoom restoration validates scale before using the legacy actual-size flag", () => {
  assert.equal(savedImageScale({ scale: 20 }), 8);
  assert.equal(savedImageScale({ scale: 0.25, actual: true }), 0.25);
  for (const scale of [0, -1, Infinity, NaN, "2", null]) {
    assert.equal(savedImageScale({ scale }), null);
    assert.equal(savedImageScale({ scale, actual: true }), 1);
  }
  assert.equal(savedImageScale(undefined), null);
  assert.equal(savedImageScale({ actual: true }), 1);
});

test("image inspector zoom keys work across the dialog and leave other keys alone", (t) => {
  const element = () =>
    Object.assign(new EventTarget(), {
      append() {},
      setAttribute() {},
      classList: { toggle() {}, remove() {} },
      style: {},
      clientWidth: 1048,
      clientHeight: 1024,
      naturalWidth: 1000,
      naturalHeight: 1000,
      scrollLeft: 0,
      scrollTop: 0,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 1000,
      }),
    });
  const globals = {
    document: { createElement: element },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (previous) {
        Object.defineProperty(globalThis, name, previous);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    });
  }
  const dialog = element();
  const area = element();
  const saved: unknown[] = [];
  const abort = new AbortController();
  setMaxListeners(0, abort.signal);
  t.after(() => abort.abort());
  imageControls({
    dialog: dialog as unknown as HTMLDialogElement,
    area: area as unknown as HTMLElement,
    image: element() as unknown as HTMLImageElement,
    toolbar: element() as unknown as HTMLElement,
    status: element() as unknown as HTMLElement,
    saved: undefined,
    persist: (value) => saved.push(value),
    signal: abort.signal,
  });
  const key = (value: string, modifiers = {}) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), {
      key: value,
      ...modifiers,
    });
    dialog.dispatchEvent(event);
    return event.defaultPrevented;
  };
  for (const [value, scale] of [
    ["+", 1.25],
    ["0", null],
    ["=", 1.25],
    ["-", 1],
    ["1", 1],
  ] as const) {
    assert.equal(key(value), true);
    assert.deepEqual(saved.at(-1), { actual: scale !== null, scale });
  }
  for (const value of ["Escape", "Enter", "Tab", " "]) {
    assert.equal(key(value), false);
  }
  for (const modifier of ["ctrlKey", "metaKey", "altKey"]) {
    assert.equal(key("0", { [modifier]: true }), false);
  }
  assert.equal(saved.length, 5);
  abort.abort();
  assert.equal(key("+"), false);
  assert.equal(saved.length, 5);
});
