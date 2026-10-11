import test from "node:test";
import assert from "node:assert/strict";
import { linkParts, externalScheme } from "./target";
import { linkAt } from "./webview";
import { protocol } from "./protocol";
test("links retain aliases, Unicode fragments and source caret identity", () => {
  assert.deepEqual(linkParts("Note%20one#Hello%20there|alias"), {
    path: "Note one",
    fragment: "Hello%20there",
  });
  assert.deepEqual(linkAt("[[Note#^id|alias]]", 10), {
    href: "Note#^id",
    wiki: true,
  });
  assert.deepEqual(linkAt("[label](https://example.com)", 4), {
    href: "https://example.com",
    wiki: false,
  });
  assert.equal(linkAt("`[[not a link]]`", 5), undefined);
});
test("link requests reject malformed values and ambiguous paths", () => {
  assert.throws(() => linkParts("bad%00path"));
  assert.throws(() => linkParts("bad%255cpath"));
  assert.throws(() => linkParts("bad%"));
  assert.equal(externalScheme("ZOTERO://select/item"), "zotero");
  assert.equal(externalScheme("../note"), undefined);
  assert.throws(() =>
    protocol.requests.open.params.parse({ href: "x", side: "yes" }),
  );
});

test("caret following supports bare URLs and autolinks without following images or code", () => {
  for (const text of [
    "https://example.com/path",
    "<https://example.com/path>",
  ]) {
    assert.deepEqual(linkAt(text, 8), {
      href: "https://example.com/path",
      wiki: false,
    });
  }
  assert.equal(linkAt("![image](https://example.com)", 15), undefined);
  assert.equal(linkAt("`https://example.com`", 8), undefined);
});
