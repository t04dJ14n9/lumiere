import { randomBytes } from "node:crypto";
import type { PanelShell } from "../../shared/runtime";
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
export function webviewHTML(panel: PanelShell): string {
  const nonce = randomBytes(24).toString("base64");
  const source = panel.cspSource;
  const policy = `default-src 'none'; script-src 'nonce-${nonce}' ${source}; style-src ${source} 'unsafe-inline'; img-src ${source} data: blob:${panel.trusted ? " https:" : ""}; media-src ${source} blob:${panel.trusted ? " https:" : ""}; frame-src ${panel.trusted ? "https:" : "'none'"}; font-src ${source} data:; connect-src ${source} blob:;`;
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${escape(panel.asset("webview/editor.css"))}"></head><body><main id="app"></main><script type="module" nonce="${nonce}" src="${escape(panel.asset("webview/editor.js"))}"></script></body></html>`;
}
