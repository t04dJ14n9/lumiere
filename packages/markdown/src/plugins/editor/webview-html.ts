import { randomBytes } from "node:crypto";
import type { PanelShell } from "../../shared/host";
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
export function webviewHTML(panel: PanelShell): string {
  const nonce = randomBytes(24).toString("base64");
  const source = panel.cspSource;
  const policy = `default-src 'none'; script-src 'nonce-${nonce}' ${source}; style-src ${source} 'unsafe-inline'; img-src ${source} data: blob:${panel.trusted ? " https:" : ""}; media-src ${source} blob:${panel.trusted ? " https:" : ""}; frame-src ${panel.trusted ? "https:" : "'none'"}; font-src ${source} data:; connect-src ${source} blob:;`;
  const editorJs = escape(panel.asset("webview/editor.js"));
  const chromeJs = escape(panel.asset("webview/chrome.js"));
  const editorCss = escape(panel.asset("webview/editor.css"));
  // modulepreload editor + Properties chrome graph in <head> so fetch overlaps
  // HTML parse / CSS. Do not evaluate a boot skeleton (regressed interactive
  // once on #285); chrome.js is fetch-only until bootstrap imports plugins.
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="modulepreload" href="${editorJs}"><link rel="modulepreload" href="${chromeJs}"><link rel="stylesheet" href="${editorCss}"><style>html,body,#app{height:100%;margin:0;background:var(--vscode-editor-background,transparent)}</style></head><body><main id="app"></main><script type="module" nonce="${nonce}" src="${editorJs}"></script></body></html>`;
}
