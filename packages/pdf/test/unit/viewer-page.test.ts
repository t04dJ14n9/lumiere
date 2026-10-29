import assert from "node:assert/strict";
import test from "node:test";
import { viewerPageHtml } from "../../src/shared/viewer-page";

const parts = {
  asset: (name: string) => `https://files.example/pdf/${name}`,
  cspSource: "https://files.example",
  nonce: "n0nce",
  toolbar: { mode: "chrome", dock: "bottom" } as const,
};

test("the viewer page loads its files with the nonce, and nothing else runs", () => {
  const html = viewerPageHtml(parts);
  assert.match(html, /script-src 'nonce-n0nce' 'wasm-unsafe-eval'/);
  assert.match(
    html,
    /<link rel="stylesheet" href="https:\/\/files\.example\/pdf\/viewer\.css">/,
  );
  assert.match(
    html,
    /<script nonce="n0nce" src="https:\/\/files\.example\/pdf\/viewer\.js"><\/script>/,
  );
  assert.match(
    html,
    /data-pdfium-wasm="https:\/\/files\.example\/pdf\/pdfium\.wasm"/,
  );
  assert.match(html, /data-toolbar="chrome" data-dock="bottom"/);
  assert.equal(html.match(/<script/g)?.length, 1);
  assert.doesNotMatch(html, /<meta name="(?!viewport)/);
});

test("a page of its own adds scripts before the viewer, and named values, escaped", () => {
  const html = viewerPageHtml({
    ...parts,
    before: ["https://files.example/page/pdf-shim.js"],
    meta: { "lumiere-pdf": 'blob:https://files.example/a"b' },
  });
  const shim = html.indexOf("pdf-shim.js");
  assert.ok(shim > 0 && shim < html.indexOf('viewer.js"'));
  assert.match(
    html,
    /<script nonce="n0nce" src="https:\/\/files\.example\/page\/pdf-shim\.js">/,
  );
  assert.match(
    html,
    /<meta name="lumiere-pdf" content="blob:https:\/\/files\.example\/a&quot;b">/,
  );
});
