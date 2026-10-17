import assert from "node:assert/strict";
import { test } from "node:test";
import { ZenWatch, zenToolbarMode } from "../../src/shared/zen";

test("in zen the chrome and slim toolbars are a floating bar; floating and none stay as chosen", () => {
  assert.equal(zenToolbarMode("chrome", true), "floating");
  assert.equal(zenToolbarMode("slim", true), "floating");
  assert.equal(zenToolbarMode("floating", true), "floating");
  assert.equal(zenToolbarMode("none", true), "none");
  for (const mode of ["chrome", "slim", "floating", "none"] as const) {
    assert.equal(zenToolbarMode(mode, false), mode);
  }
});

test("full-screen zen ends when the window stops filling the screen, once", () => {
  const screen = { width: 1920, height: 1200 };
  const watch = new ZenWatch();
  // Zen was asked for; the window has not gone full screen yet.
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
  // A full-screen window with zen off, then resized.
  assert.equal(watch.left(false, screen, screen), false);
  assert.equal(watch.left(false, { width: 1000, height: 700 }, screen), false);
});
