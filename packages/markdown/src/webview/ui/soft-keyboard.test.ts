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
  const ipad = device({ "(pointer: coarse)": true });
  assert.equal(focusOpensKeyboard(ipad), true);
});

test("a computer, or a tablet with a trackpad, takes focus at once", () => {
  const mac = device({ "(any-pointer: fine)": true });
  assert.equal(focusOpensKeyboard(mac), false);
  const ipadWithTrackpad = device({
    "(pointer: coarse)": true,
    "(any-pointer: fine)": true,
  });
  assert.equal(focusOpensKeyboard(ipadWithTrackpad), false);
});
