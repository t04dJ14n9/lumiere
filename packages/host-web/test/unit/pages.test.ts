import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { PageSocket, PanelUrls } from "@workshop/host-node/core";
import { openEditorPage } from "../../src/pages";

/** The panel hub's side of one page, as host-node's would be. */
function fakeHost() {
  const sockets: PageSocket[] = [];
  let urls: PanelUrls | undefined;
  const roots: string[] = [];
  return {
    sockets,
    roots,
    urls: () => urls!,
    host: {
      panels: {
        open: async (request: {
          uri: string;
          urls: (id: string) => PanelUrls;
        }) => {
          urls = request.urls("panel-1");
          return {
            id: "panel-1",
            html: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'nonce-abc'"></head><body><script type="module" nonce="abc" src="${urls.asset("webview/editor.js")}"></script></body></html>`,
          };
        },
        attach: (_id: string, socket: PageSocket) => {
          sockets.push(socket);
          return true;
        },
      },
      addRoot: (root: string) => void roots.push(root),
    },
  };
}

const URLS = {
  origin: "https://lumiere.example",
  editor: "https://lumiere.example/app/markdown/",
  shim: "https://lumiere.example/app/page/shim.js",
  pdf: {
    viewer: "https://lumiere.example/app/pdf/",
    shim: "https://lumiere.example/app/page/pdf-shim.js",
  },
  resource: (panel: string, uri: string) =>
    `https://lumiere.example/app/lumiere/file?panel=${panel}&uri=${encodeURIComponent(uri)}`,
};

test("a note's page is a blob document that asks for a channel, with the shim first", async () => {
  const fake = fakeHost();
  const page = await openEditorPage(
    fake.host as never,
    { uri: "file:///vaults/Notes/Welcome.md", root: "file:///vaults/Notes" },
    URLS,
  );
  assert.equal(page.id, "panel-1");
  assert.match(page.url, /^blob:/);
  const html = await (await fetch(page.url)).text();
  assert.match(html, /<meta name="lumiere-transport" content="channel">/);
  assert.match(html, /<meta name="lumiere-panel" content="panel-1">/);
  assert.match(
    html,
    /<meta name="lumiere-state" content="file:\/\/\/vaults\/Notes\/Welcome.md">/,
  );
  assert.ok(
    html.indexOf("page/shim.js") < html.indexOf("markdown/webview/editor.js"),
    "the shim runs before the editor",
  );
  assert.equal(fake.urls().cspSource, "https://lumiere.example");
  assert.match(
    fake.urls().resource("file:///vaults/Notes/a.png"),
    /lumiere\/file\?panel=panel-1/,
  );
  assert.deepEqual(fake.roots, ["file:///vaults/Notes"]);
  page.dispose();
});

test("an embedder may serve the page itself, until the tab closes", async () => {
  const fake = fakeHost();
  const served: string[] = [];
  let disposed = 0;
  const page = await openEditorPage(
    fake.host as never,
    { uri: "file:///vaults/Notes/Welcome.md", root: "file:///vaults/Notes" },
    {
      ...URLS,
      servePage: (html) => {
        served.push(html);
        return {
          url: "https://lumiere.example/app/lumiere/page/1",
          dispose: () => void disposed++,
        };
      },
    },
  );
  assert.equal(page.url, "https://lumiere.example/app/lumiere/page/1");
  assert.equal(served.length, 1);
  assert.match(served[0]!, /<meta name="lumiere-transport" content="channel">/);
  assert.match(served[0]!, /<meta name="lumiere-panel" content="panel-1">/);
  page.dispose();
  assert.equal(disposed, 1);
});

test("an embedder that does not serve a page gets a blob document", async () => {
  const fake = fakeHost();
  const page = await openEditorPage(
    fake.host as never,
    { uri: "file:///vaults/Notes/Welcome.md", root: "file:///vaults/Notes" },
    { ...URLS, servePage: () => undefined },
  );
  assert.match(page.url, /^blob:/);
  assert.match(await (await fetch(page.url)).text(), /lumiere-panel/);
  page.dispose();
  await assert.rejects(fetch(page.url), "closing the tab frees the page");
});

test("the channel carries frames both ways, and closing the tab closes the panel's socket", async () => {
  const fake = fakeHost();
  const page = await openEditorPage(
    fake.host as never,
    { uri: "file:///vaults/Notes/Welcome.md", root: "file:///vaults/Notes" },
    URLS,
  );
  const port = page.connect();
  const socket = fake.sockets[0]!;
  const fromPage: string[] = [];
  socket.onMessage((text) => fromPage.push(text));
  const fromHost: string[] = [];
  port.onmessage = (event) => fromHost.push(String(event.data));
  port.postMessage('{"ch":"rpc","data":1}');
  socket.send('{"ch":"rpc","data":2}');
  await delay(20);
  assert.deepEqual(fromPage, ['{"ch":"rpc","data":1}']);
  assert.deepEqual(fromHost, ['{"ch":"rpc","data":2}']);
  let closed = false;
  socket.onClose(() => {
    closed = true;
  });
  page.dispose();
  assert.equal(closed, true);
  port.close();
});

test("a PDF's page is Lumière's viewer, with its host's stand-in first and the PDF named", async () => {
  const { openPdfPage } = await import("../../src/pages");
  const page = openPdfPage(new Uint8Array([37, 80, 68, 70]), URLS);
  assert.match(page.url, /^blob:/);
  const html = await (await fetch(page.url)).text();
  const shim = html.indexOf(
    'src="https://lumiere.example/app/page/pdf-shim.js"',
  );
  const viewer = html.indexOf(
    'src="https://lumiere.example/app/pdf/viewer.js"',
  );
  assert.ok(shim > 0 && viewer > shim, "the stand-in runs before the viewer");
  assert.match(
    html,
    /data-pdfium-wasm="https:\/\/lumiere\.example\/app\/pdf\/pdfium\.wasm"/,
  );
  assert.match(html, /data-toolbar="slim"/);
  const pdf = /<meta name="lumiere-pdf" content="(blob:[^"]+)">/.exec(
    html,
  )?.[1];
  assert.ok(pdf, "the page names its PDF");
  const response = await fetch(pdf);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array([37, 80, 68, 70]),
  );
  page.dispose();
  await assert.rejects(fetch(pdf), "closing the tab frees the PDF");
});
