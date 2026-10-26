import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { ToolbarSettings } from "../../../shared/toolbar-settings";
import { viewerPageHtml } from "../../../shared/viewer-page";

/** The viewer page in VS Code's webview, its files served from the extension. */
export function viewerHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  toolbar: ToolbarSettings,
): string {
  return viewerPageHtml({
    asset: (name) =>
      webview
        .asWebviewUri(
          vscode.Uri.joinPath(extensionUri, "dist", "pdf", "webview", name),
        )
        .toString(),
    cspSource: webview.cspSource,
    nonce: randomBytes(16).toString("base64"),
    toolbar,
  });
}
