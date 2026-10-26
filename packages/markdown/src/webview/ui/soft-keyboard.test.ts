import assert from "node:assert/strict";
import test from "node:test";
import { focusOpensKeyboard } from "./soft-keyboard";

function device(queries: Record<string, boolean>) {
  return {
    matchMedia: (query: string) =>
      ({ matches: queries[query] ?? false }) as MediaQueryList,
  };
}

test("a touch-only tablet waits for a tap before the editor takes focus", () => {
  const ipad = device({
    "(pointer: coarse)": true,
    "(any-pointer: coarse)": true,
  });
  assert.equal(focusOpensKeyboard(ipad), true);
});

test("an iPad with a paired Pencil still waits for a tap", () => {
  // What WebKit reports on an iPad Pro with a Pencil paired: the Pencil
  // counts as a fine pointer that hovers, but the finger stays primary.
  const ipadWithPencil = device({
    "(pointer: coarse)": true,
    "(any-pointer: coarse)": true,
    "(any-pointer: fine)": true,
    "(any-hover: hover)": true,
  });
  assert.equal(focusOpensKeyboard(ipadWithPencil), true);
});

test("a computer takes focus at once", () => {
  const mac = device({
    "(pointer: fine)": true,
    "(any-pointer: fine)": true,
    "(hover: hover)": true,
    "(any-hover: hover)": true,
  });
  assert.equal(focusOpensKeyboard(mac), false);
});
