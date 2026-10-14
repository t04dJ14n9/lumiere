import { randomBytes } from "node:crypto";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");

/** Panel document. Scripts and the layout worker come from the extension; nothing is fetched. */
export function graphPanelHtml(assets: {
  cspSource: string;
  script: string;
  style: string;
  worker: string;
}): string {
  const nonce = randomBytes(24).toString("base64");
  const policy = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${assets.cspSource}`,
    `style-src ${assets.cspSource} 'unsafe-inline'`,
    `worker-src ${assets.cspSource}`,
    `img-src ${assets.cspSource} data:`,
    `font-src ${assets.cspSource}`,
    "connect-src 'none'",
  ].join("; ");
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><link rel="stylesheet" href="${escape(assets.style)}"></head><body data-worker="${escape(assets.worker)}"><main id="app"></main><script type="module" nonce="${nonce}" src="${escape(assets.script)}"></script></body></html>`;
}
