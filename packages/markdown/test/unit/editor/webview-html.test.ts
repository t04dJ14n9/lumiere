import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOT_TEXT_CHARS,
  bootMarkup,
  webviewHTML,
} from "../../../src/plugins/editor/webview-html";
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

test("boot markup escapes HTML and stays within the opening band", () => {
  const html = bootMarkup(
    `# Hi <script>alert(1)</script>\n` + "x".repeat(BOOT_TEXT_CHARS),
  );
  assert.match(html, /^<pre id="mw-boot">/);
  assert.match(html, /# Hi &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.length < BOOT_TEXT_CHARS * 2);
});

test("webview HTML embeds boot text when provided", () => {
  const html = webviewHTML(shell(true), { bootText: "Hello & <world>" });
  assert.match(html, /id="mw-boot"/);
  assert.match(html, /Hello &amp; &lt;world&gt;/);
});
