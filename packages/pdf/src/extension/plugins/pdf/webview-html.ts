import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { ToolbarSettings } from "../../../shared/toolbar-settings";

/**
 * The viewer page. Scripts load only from the extension, with a nonce; the
 * PDF engine needs `wasm-unsafe-eval`, and its worker starts from a blob URL.
 * The toolbar setting is in the page, so the first paint has the right
 * layout; later changes arrive as messages.
 */
export function viewerHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  toolbar: ToolbarSettings,
): string {
  const asset = (name: string) =>
    webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "dist", "pdf", "webview", name),
    );
  const nonce = randomBytes(16).toString("base64");
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    // React and EmbedPDF position pages and overlays with inline styles.
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${webview.cspSource} blob: data:`,
    `font-src ${webview.cspSource}`,
    `connect-src ${webview.cspSource} blob:`,
    `worker-src blob:`,
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asset("viewer.css").toString()}">
  <title>PDF</title>
</head>
<body>
  <div id="root" data-pdfium-wasm="${asset("pdfium.wasm").toString()}" data-toolbar="${toolbar.mode}" data-dock="${toolbar.dock}"></div>
  <script nonce="${nonce}" src="${asset("viewer.js").toString()}"></script>
</body>
</html>`;
}
