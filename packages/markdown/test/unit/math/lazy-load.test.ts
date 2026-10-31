import test from "node:test";
import assert from "node:assert/strict";
import {
  mathJaxLoadStartedForTest,
  mathWebview,
  primeMathJaxForTest,
} from "../../../src/plugins/math/webview";
import { fixture } from "../features/fixture";

test("mathWebview.apply does not eagerly load MathJax", async () => {
  primeMathJaxForTest(undefined);
  assert.equal(mathJaxLoadStartedForTest(), false);

  const f = fixture();
  try {
    f.root.plugin(mathWebview);
    await f.root.settled();
    assert.equal(
      mathJaxLoadStartedForTest(),
      false,
      "MathJax must load on first math block, not during apply",
    );
  } finally {
    await f.root.dispose();
    primeMathJaxForTest(undefined);
  }
});
