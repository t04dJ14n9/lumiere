/** The changes the editor's page needs to run outside VS Code, on any platform. */
/**
 * Add the panel's id and the shim to the editor's HTML. The shim stands in
 * for VS Code's webview API, so it must run before the editor's module; it
 * reuses the page's script nonce to pass the content security policy.
 */
export function injectShim(
  html: string,
  panelId: string,
  shimUrl: string,
): string {
  const nonce = /nonce="([^"]+)"/.exec(html)?.[1];
  if (!nonce) {
    throw new Error("The editor page has no script nonce");
  }
  const meta = `<meta name="lumiere-panel" content="${escape(panelId)}">`;
  const script = `<script nonce="${nonce}" src="${escape(shimUrl)}"></script>`;
  const withMeta = html.replace("<head>", `<head>${meta}`);
  const at = withMeta.indexOf("<script");
  return at < 0
    ? withMeta.replace("</body>", `${script}</body>`)
    : withMeta.slice(0, at) + script + withMeta.slice(at);
}

/**
 * `'self'` plus this page's own socket origin. The Host header is copied into
 * the content security policy, so anything that is not a host or host:port is
 * dropped rather than widening `connect-src`.
 */
const SOCKET_HOST =
  /^(?:[a-zA-Z0-9.-]{1,253}|\[[0-9a-fA-F:]{2,64}\])(?::\d{1,5})?$/;

export function socketSource(host: string): string {
  if (!SOCKET_HOST.test(host)) {
    return "'self'";
  }
  return `'self' ws://${host} wss://${host}`;
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}
