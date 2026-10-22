import test from "node:test";
import assert from "node:assert/strict";
import { dshPalette } from "../../src/client/theme";

test("DSH's tokens fill every palette role", () => {
  const palette = dshPalette((name) => `dsh:${name}`, true, "DSH Sans");
  assert.equal(palette.background, "dsh:bg-base");
  assert.equal(palette.accent, "dsh:link");
  assert.equal(palette.dark, true);
  for (const [role, value] of Object.entries(palette)) {
    assert.ok(value !== "", `${role} is empty`);
  }
});
