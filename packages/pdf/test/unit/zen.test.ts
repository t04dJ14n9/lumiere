import assert from "node:assert/strict";
import { test } from "node:test";
import { ZenWatch, zenToolbarMode } from "../../src/shared/zen";

test("zen does not force a floating overlay; modes stay as chosen", () => {
  assert.equal(zenToolbarMode("chrome", true), "chrome");
  assert.equal(zenToolbarMode("slim", true), "slim");
  assert.equal(zenToolbarMode("none", true), "none");
  for (const mode of ["chrome", "slim", "none"] as const) {
    assert.equal(zenToolbarMode(mode, false), mode);
  }
});

test("full-screen zen ends when the window stops filling the screen, once", () => {
  const screen = { width: 1920, height: 1200 };
  const watch = new ZenWatch();
  assert.equal(watch.left(true, { width: 1440, height: 900 }, screen), false);
  assert.equal(watch.left(true, screen, screen), false);
  assert.equal(watch.left(true, { width: 1440, height: 900 }, screen), true);
  assert.equal(watch.left(true, { width: 1440, height: 900 }, screen), false);
});

test("a windowed zen, or no zen at all, is never reported as ended", () => {
  const screen = { width: 1920, height: 1200 };
  const watch = new ZenWatch();
  assert.equal(watch.left(true, { width: 1000, height: 700 }, screen), false);
  assert.equal(watch.left(true, { width: 1100, height: 700 }, screen), false);
  assert.equal(watch.left(false, screen, screen), false);
  assert.equal(watch.left(false, { width: 1000, height: 700 }, screen), false);
});
