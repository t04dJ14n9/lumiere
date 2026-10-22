import { randomBytes } from "node:crypto";
import type { PanelShell } from "../../shared/host";

/** Opening band shown before editor.js paints (matches first-paint parse budget). */
export const BOOT_TEXT_CHARS = 10_000;

const escapeAttr = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

const escapeText = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function webviewHTML(
  panel: PanelShell,
  options: { bootText?: string } = {},
): string {
  const nonce = randomBytes(24).toString("base64");
  const source = panel.cspSource;
  const policy = `default-src 'none'; script-src 'nonce-${nonce}' ${source}; style-src ${source} 'unsafe-inline'; img-src ${source} data: blob:${panel.trusted ? " https:" : ""}; media-src ${source} blob:${panel.trusted ? " https:" : ""}; frame-src ${panel.trusted ? "https:" : "'none'"}; font-src ${source} data:; connect-src ${source} blob:;`;
  const boot = bootMarkup(options.bootText);
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttr(policy)}"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${escapeAttr(panel.asset("webview/editor.css"))}"><style>html,body,#app{height:100%;margin:0;background:var(--vscode-editor-background,transparent)}#mw-boot{margin:0;padding:0 4px;white-space:pre-wrap;word-break:break-word;font-family:var(--vscode-editor-font-family,monospace);font-size:var(--vscode-editor-font-size,14px);line-height:var(--vscode-editor-line-height,normal);color:var(--vscode-editor-foreground,inherit);overflow:hidden;max-height:100%;box-sizing:border-box}</style></head><body><main id="app">${boot}</main><script type="module" nonce="${nonce}" src="${escapeAttr(panel.asset("webview/editor.js"))}"></script></body></html>`;
}

/** Line-aligned prefix so cold open is not a blank editor while editor.js loads. */
export function bootMarkup(text: string | undefined): string {
  if (!text) {
    return "";
  }
  const end = Math.min(text.length, BOOT_TEXT_CHARS);
  let cut = end;
  if (end < text.length) {
    const nl = text.lastIndexOf("\n", end);
    if (nl > 0) {
      cut = nl + 1;
    }
  }
  const slice = text.slice(0, cut);
  if (!slice) {
    return "";
  }
  return `<pre id="mw-boot">${escapeText(slice)}</pre>`;
}
