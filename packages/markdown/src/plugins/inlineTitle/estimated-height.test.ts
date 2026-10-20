import assert from "node:assert/strict";
import test from "node:test";
import { titleEstimatedHeight } from "./estimated-height";

test("empty title still reserves one h1 line of chrome", () => {
  assert.ok(titleEstimatedHeight("") > 20);
  assert.ok(titleEstimatedHeight("Note") > 20);
});

test("long wrapping titles reserve multiple h1 lines", () => {
  const short = titleEstimatedHeight("Note");
  const long = titleEstimatedHeight(
    "A very long note title that wraps across several lines in a narrow pane and keeps going with more words",
  );
  assert.ok(long > short, `short=${short} long=${long}`);
  assert.ok(long > 60, `got ${long}`);
  assert.ok(
    Math.ceil(long / short) >= 2,
    `expected at least ~2× short, short=${short} long=${long}`,
  );
});

test("near-max filename length stays well above one editor line", () => {
  const maxed = titleEstimatedHeight("x".repeat(200));
  assert.ok(maxed > 150, `got ${maxed}`);
});
