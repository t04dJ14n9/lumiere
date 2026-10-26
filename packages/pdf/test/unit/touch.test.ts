import assert from "node:assert/strict";
import test from "node:test";
import { touchOnly } from "../../src/webview/touch";

function device(queries: Record<string, boolean>) {
  return {
    matchMedia: (query: string) =>
      ({ matches: queries[query] ?? false }) as MediaQueryList,
  };
}

test("a finger scrolls the pages only where there is no mouse or trackpad", () => {
  assert.equal(touchOnly(device({ "(pointer: coarse)": true })), true);
  assert.equal(touchOnly(device({ "(any-pointer: fine)": true })), false);
  assert.equal(
    touchOnly(
      device({ "(pointer: coarse)": true, "(any-pointer: fine)": true }),
    ),
    false,
  );
});
