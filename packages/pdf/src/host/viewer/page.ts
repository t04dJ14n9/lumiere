import { randomBytes } from "node:crypto";
import type { PdfWebview } from "../../shared/host";
import type { ToolbarSettings } from "../../shared/toolbar-settings";
import { viewerPageHtml } from "../../shared/viewer-page";

/**
 * The viewer page. Scripts load only from the host, with a nonce; the
 * PDF engine needs `wasm-unsafe-eval`, and its worker starts from a blob URL.
 * The toolbar setting is in the page, so the first paint has the right
 * layout; later changes arrive as messages.
 */
export function viewerHtml(
  webview: Pick<PdfWebview, "cspSource" | "asset">,
  toolbar: ToolbarSettings,
): string {
  return viewerPageHtml({
    asset: (name) => webview.asset(name),
    cspSource: webview.cspSource,
    nonce: randomBytes(16).toString("base64"),
    toolbar,
  });
}
