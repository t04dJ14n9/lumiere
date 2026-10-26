// The URLs the service worker answers by asking the window: made by the
// window, read by the worker, under the app's address (any path).
import test from "node:test";
import assert from "node:assert/strict";
import { fileUri } from "@workshop/host-node/core";
import {
  fileUrl,
  isAppWindow,
  pageUrl,
  routeOf,
} from "../../src/shared/routes";

const BASE = "https://example.github.io/lumiere/";

test("a note's page is served under the app's address, and read back", () => {
  const url = pageUrl(BASE, "0a1b");
  assert.equal(url, "https://example.github.io/lumiere/lumiere/page/0a1b");
  assert.deepEqual(routeOf(url, BASE), { kind: "page", id: "0a1b" });
  assert.deepEqual(routeOf(`${url}?reload=1#top`, BASE), {
    kind: "page",
    id: "0a1b",
  });
});

test("a file a note shows is named by its panel and URI, and read back", () => {
  const uri = fileUri("/vaults/Lumière/Attachments/a#b?c 100%.png");
  const url = fileUrl(BASE, "p1", uri);
  assert.ok(url.startsWith(`${BASE}lumiere/file?panel=p1&uri=`));
  assert.deepEqual(routeOf(url, BASE), { kind: "file", panel: "p1", uri });
});

test("the mtime the editor adds to a file's URL is not part of the file", () => {
  const uri = fileUri("/vaults/Notes/a?.png");
  assert.deepEqual(
    routeOf(`${fileUrl(BASE, "p1", uri)}?v=1793006713113`, BASE),
    {
      kind: "file",
      panel: "p1",
      uri,
    },
  );
});

test("a file route needs a panel and a file: URI", () => {
  const file = (query: string) => routeOf(`${BASE}lumiere/file?${query}`, BASE);
  assert.equal(
    file(`uri=${encodeURIComponent("file:///vaults/a.png")}`),
    undefined,
  );
  assert.equal(
    file(`panel=&uri=${encodeURIComponent("file:///vaults/a.png")}`),
    undefined,
  );
  assert.equal(file("panel=p1"), undefined);
  assert.equal(
    file(`panel=p1&uri=${encodeURIComponent("https://example.com/a.png")}`),
    undefined,
  );
  assert.equal(file("panel=p1&uri=not%20a%20url"), undefined);
});

test("the app's own files, other paths and other apps are not routes", () => {
  assert.equal(routeOf(`${BASE}app.js`, BASE), undefined);
  assert.equal(routeOf(`${BASE}markdown/webview/editor.js`, BASE), undefined);
  assert.equal(routeOf(`${BASE}lumiere/page/`, BASE), undefined);
  assert.equal(routeOf(`${BASE}lumiere/page/%E0%A4%A`, BASE), undefined);
  assert.equal(
    routeOf("https://example.github.io/other/lumiere/page/0a1b", BASE),
    undefined,
  );
});

test("the worker asks the app's windows only, not notes' pages or other apps", () => {
  assert.equal(isAppWindow(BASE, BASE), true);
  assert.equal(isAppWindow(`${BASE}index.html?vault=1`, BASE), true);
  assert.equal(isAppWindow(pageUrl(BASE, "0a1b"), BASE), false);
  assert.equal(isAppWindow("https://example.github.io/other/", BASE), false);
  assert.equal(isAppWindow("blob:https://example.github.io/1234", BASE), false);
});
