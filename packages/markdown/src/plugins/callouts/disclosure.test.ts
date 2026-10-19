import test from "node:test";
import assert from "node:assert/strict";
import { bindDisclosure } from "./webview";

// A summary's descendants bubble clicks to it in the browser. Dispatch at
// that boundary to check disclosure ownership without a browser regression.
test("the title and chevron toggle a folded callout, and disposal releases their listeners", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Element");
  class Element extends EventTarget {
    closest() {
      return null;
    }
  }
  Object.defineProperty(globalThis, "Element", {
    value: Element,
    configurable: true,
  });
  t.after(() => {
    if (previous) {
      Object.defineProperty(globalThis, "Element", previous);
    } else {
      Reflect.deleteProperty(globalThis, "Element");
    }
  });
  const title = new Element();
  const details = Object.assign(new Element(), {
    open: false,
    querySelector: () => title,
  });
  const abort = new AbortController();
  t.after(() => abort.abort());
  let remembered = 0;
  bindDisclosure({
    details: details as unknown as HTMLDetailsElement,
    signal: abort.signal,
    remember: () => remembered++,
  });
  assert.equal(details.open, false);
  for (const expected of [true, false]) {
    const event = new Event("click", { cancelable: true });
    title.dispatchEvent(event);
    assert.equal(details.open, expected);
    assert.equal(event.defaultPrevented, true);
  }
  assert.equal(remembered, 2);
  abort.abort();
  title.dispatchEvent(new Event("click"));
  assert.equal(details.open, false);
  assert.equal(remembered, 2);
});
