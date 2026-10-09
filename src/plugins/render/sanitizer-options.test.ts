import test from "node:test";
import assert from "node:assert/strict";
import { sanitizerOptions } from "./sanitizer-options";

// DOMPurify needs a DOM, which unit tests do not have; the options are what
// decide the behaviour. With ALLOW_UNKNOWN_PROTOCOLS, DOMPurify keeps any
// href that is not a script or data URL.
test("rendered links keep application schemes such as zotero: and vscode:", () => {
  for (const trusted of [true, false]) {
    const options = sanitizerOptions(trusted);
    assert.equal(options.ALLOW_UNKNOWN_PROTOCOLS, true);
    assert.deepEqual(options.FORBID_TAGS, [
      "script",
      "style",
      "form",
      "object",
      "embed",
    ]);
    assert.deepEqual(options.FORBID_ATTR, ["srcdoc"]);
  }
  assert.deepEqual(sanitizerOptions(true).ADD_TAGS, ["iframe"]);
  assert.deepEqual(sanitizerOptions(false).ADD_TAGS, []);
});
