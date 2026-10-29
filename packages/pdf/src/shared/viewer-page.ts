import {
  DEFAULT_FLOATING_DOCK,
  type ToolbarSettings,
} from "./toolbar-settings";

/**
 * The toolbar of a viewer in a page of its own (the web and iPad apps): in
 * the page, since there is no editor title bar to hold its buttons.
 */
export const PAGE_TOOLBAR: ToolbarSettings = {
  mode: "slim",
  dock: DEFAULT_FLOATING_DOCK,
};

/** What a viewer page is made of where it runs. */
export interface ViewerPageParts {
  /** The URL of one of the viewer's built files: viewer.js, viewer.css, pdfium.wasm. */
  asset(name: string): string;
  /** Where the page's files come from, for its policy. */
  readonly cspSource: string;
  /** Scripts run only with it. */
  readonly nonce: string;
  readonly toolbar: ToolbarSettings;
  /** Scripts that run before the viewer, such as a stand-in for its host. */
  readonly before?: readonly string[];
  /** Named values in the page's head, for those scripts. */
  readonly meta?: Readonly<Record<string, string>>;
}

/**
 * The viewer page, in VS Code's webview (extension/plugins/pdf/webview-html.ts)
 * or in a page of the web and iPad apps (packages/host-web, `openPdfPage`).
 * Scripts load only with the nonce; the PDF engine needs `wasm-unsafe-eval`,
 * and its worker starts from a blob URL. The toolbar setting is in the page,
 * so the first paint has the right layout; later changes arrive as messages.
 */
export function viewerPageHtml(parts: ViewerPageParts): string {
  const { asset, cspSource, nonce, toolbar } = parts;
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    // React and EmbedPDF position pages and overlays with inline styles.
    `style-src ${cspSource} 'unsafe-inline'`,
    `img-src ${cspSource} blob: data:`,
    `font-src ${cspSource}`,
    `connect-src ${cspSource} blob:`,
    `worker-src blob:`,
  ].join("; ");
  const meta = Object.entries(parts.meta ?? {})
    .map(
      ([name, content]) =>
        `\n  <meta name="${attribute(name)}" content="${attribute(content)}">`,
    )
    .join("");
  const before = (parts.before ?? [])
    .map(
      (src) => `\n  <script nonce="${nonce}" src="${attribute(src)}"></script>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">${meta}
  <link rel="stylesheet" href="${asset("viewer.css")}">
  <title>PDF</title>${before}
</head>
<body>
  <div id="root" data-pdfium-wasm="${asset("pdfium.wasm")}" data-toolbar="${toolbar.mode}" data-dock="${toolbar.dock}"></div>
  <script nonce="${nonce}" src="${asset("viewer.js")}"></script>
</body>
</html>`;
}

function attribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
