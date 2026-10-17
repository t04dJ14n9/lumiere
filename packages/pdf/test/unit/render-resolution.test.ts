import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPixelRatio } from "../../src/webview/render-resolution";

test("zoomed-out pages get extra detail, capped at 3x and by the pixel budget", () => {
  assert.equal(renderPixelRatio(1, 2, 600, 800), 2);
  assert.equal(renderPixelRatio(0.5, 1, 300, 400), 2);
  assert.equal(renderPixelRatio(0.1, 2, 60, 80), 3);
  const huge = renderPixelRatio(4, 2, 4000, 6000);
  assert.ok(huge * huge * 4000 * 6000 <= 16 * 1024 * 1024 + 1);
});
