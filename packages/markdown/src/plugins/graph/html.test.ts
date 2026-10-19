import test from "node:test";
import assert from "node:assert/strict";
import { graphPanelHtml } from "./html";

test("the graph panel allows a blob layout worker and fetching its script", () => {
  const html = graphPanelHtml({
    cspSource: "https://example.vscode-cdn.net",
    script: "https://example.vscode-cdn.net/graph.js",
    style: "https://example.vscode-cdn.net/graph.css",
    worker: "https://example.vscode-cdn.net/graph-layout.js",
  });
  assert.match(html, /worker-src blob:/);
  assert.match(html, /connect-src https:\/\/example\.vscode-cdn\.net/);
  assert.match(
    html,
    /data-worker="https:\/\/example\.vscode-cdn\.net\/graph-layout\.js"/,
  );
});
