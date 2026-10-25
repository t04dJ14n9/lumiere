import test from "node:test";
import assert from "node:assert/strict";
import { headingLabel } from "../../../src/markdown/metadata/heading-extract";

test("headingLabel keeps text, code and image alt like markdown-it inline", () => {
  assert.equal(headingLabel("Hello **world**"), "Hello world");
  assert.equal(headingLabel("use `code` here"), "use code here");
  assert.equal(headingLabel("see ![alt](http://x)"), "see alt");
  assert.equal(headingLabel("a [link](http://x) b"), "a link b");
  assert.equal(headingLabel("[[Note|Alias]]"), "Alias");
  assert.equal(headingLabel("[[Note]]"), "Note");
});
