import test from "node:test";
import assert from "node:assert/strict";
import { injectShim, pageQuery } from "../../src/host/page";

const url = (query: string) => new URL(`http://h/lumiere/editor?${query}`);

test("a page opens a Markdown note inside its workspace, and nothing else", () => {
  assert.deepEqual(pageQuery(url("path=/v/notes/A.md&root=/v")), {
    note: "/v/notes/A.md",
    root: "/v",
  });
  assert.deepEqual(pageQuery(url("path=/v/A.markdown")), {
    note: "/v/A.markdown",
    root: "/v",
  });
  for (const bad of [
    "path=/v/A.txt&root=/v",
    "path=notes/A.md&root=/v",
    "path=/other/A.md&root=/v",
    "path=/v/../etc/A.md&root=/v",
    "path=/v/A.md&root=relative",
    "",
  ]) {
    assert.equal(pageQuery(url(bad)), undefined, bad);
  }
});

test("the shim runs first, with the page's nonce, and the panel id is in the head", () => {
  const html =
    '<!doctype html><html><head><meta charset="UTF-8"></head><body><main id="app"></main>' +
    '<script type="module" nonce="abc123" src="/lumiere/m/webview/editor.js"></script></body></html>';
  const page = injectShim(html, 'p"1', "/lumiere/d/shim.js");
  assert.ok(
    page.includes('<head><meta name="lumiere-panel" content="p&quot;1">'),
  );
  const shim = page.indexOf(
    '<script nonce="abc123" src="/lumiere/d/shim.js"></script>',
  );
  assert.ok(shim > 0);
  assert.ok(shim < page.indexOf('type="module"'));
  assert.throws(() => injectShim("<html><head></head></html>", "p", "/s.js"));
});
