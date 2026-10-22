import assert from "node:assert/strict";
import test from "node:test";
import { webviewHTML } from "../../../src/plugins/editor/webview-html";
import type { PanelShell } from "../../../src/shared/host";

function shell(trusted: boolean): PanelShell {
  return {
    cspSource: "vscode-resource:",
    trusted,
    asset: (relative: string) => `vscode-resource:/${relative}`,
  } as unknown as PanelShell;
}
function policy(trusted: boolean): Map<string, string> {
  const html = webviewHTML(shell(trusted));
  const content = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
  assert.ok(content);
  const directives = new Map<string, string>();
  for (const part of content.replaceAll("&amp;", "&").split(";")) {
    const [name, ...values] = part.trim().split(" ");
    if (name) {
      directives.set(name, values.join(" "));
    }
  }
  return directives;
}

test("the webview CSP matches DESIGN §19 in a trusted workspace", () => {
  const csp = policy(true);
  assert.equal(csp.get("default-src"), "'none'");
  assert.match(csp.get("script-src") ?? "", /^'nonce-[^']+' vscode-resource:$/);
  assert.equal(csp.get("img-src"), "vscode-resource: data: blob: https:");
  assert.equal(csp.get("media-src"), "vscode-resource: blob: https:");
  assert.equal(csp.get("frame-src"), "https:");
  assert.equal(csp.get("font-src"), "vscode-resource: data:");
  assert.equal(csp.get("connect-src"), "vscode-resource: blob:");
});

test("an untrusted workspace drops remote images, media and frames", () => {
  const csp = policy(false);
  assert.equal(csp.get("img-src"), "vscode-resource: data: blob:");
  assert.equal(csp.get("media-src"), "vscode-resource: blob:");
  assert.equal(csp.get("frame-src"), "'none'");
  assert.equal(csp.get("connect-src"), "vscode-resource: blob:");
});

test("each page gets a fresh script nonce", () => {
  assert.notEqual(
    policy(true).get("script-src"),
    policy(true).get("script-src"),
  );
});

test("HTML modulepreloads editor.js and chrome.js in the head", () => {
  const html = webviewHTML(shell(true));
  assert.match(
    html,
    /<link rel="modulepreload" href="vscode-resource:\/webview\/editor\.js">/,
  );
  assert.match(
    html,
    /<link rel="modulepreload" href="vscode-resource:\/webview\/chrome\.js">/,
  );
  // Preloads must precede the editor script so fetch overlaps HTML/CSS parse.
  const chromePreload = html.indexOf(
    'rel="modulepreload" href="vscode-resource:/webview/chrome.js"',
  );
  const editorScript = html.indexOf('<script type="module"');
  assert.ok(chromePreload >= 0 && chromePreload < editorScript);
});
