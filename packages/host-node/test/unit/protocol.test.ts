import test from "node:test";
import assert from "node:assert/strict";
import { parseHostFrame, safeExternalHref } from "../../src/protocol";

test("external links keep http, https and mailto, and drop schemes that run code or read files", () => {
  assert.equal(
    safeExternalHref("https://example.com/a b"),
    "https://example.com/a%20b",
  );
  assert.equal(safeExternalHref("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(safeExternalHref("vscode://file/x"), "vscode://file/x");
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "command:workbench.action.files.openFile",
    "not a url",
  ]) {
    assert.equal(safeExternalHref(href), undefined, href);
  }
});

test("a host frame is rpc or ui, and anything else is ignored", () => {
  assert.deepEqual(parseHostFrame('{"ch":"rpc","data":{"n":1}}'), {
    ch: "rpc",
    data: { n: 1 },
  });
  assert.deepEqual(parseHostFrame('{"ch":"ui","data":{"type":"toast"}}'), {
    ch: "ui",
    data: { type: "toast" },
  });
  for (const text of [
    "{",
    "null",
    "[]",
    '{"ch":"ui"}',
    '{"ch":"nope","data":{}}',
  ]) {
    assert.equal(parseHostFrame(text), undefined, text);
  }
});
