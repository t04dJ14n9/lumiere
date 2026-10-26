import test from "node:test";
import assert from "node:assert/strict";
import { injectShim, socketSource } from "../../src/host/page";
import { pageQuery } from "../../src/host/page-query";

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
    "path=/v/A.md&root=/",
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

test("the socket origin is a host, never a content-security-policy breakout", () => {
  assert.equal(
    socketSource("localhost:3000"),
    "'self' ws://localhost:3000 wss://localhost:3000",
  );
  assert.equal(
    socketSource("[::1]:443"),
    "'self' ws://[::1]:443 wss://[::1]:443",
  );
  for (const host of [
    "",
    "evil.com 'unsafe-inline'",
    "localhost:3000\r\nX",
    "a b",
  ]) {
    assert.equal(socketSource(host), "'self'", host);
  }
});
