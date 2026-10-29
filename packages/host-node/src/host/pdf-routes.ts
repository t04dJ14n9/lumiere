/**
 * The PDF viewer's routes (pdf-pages.ts), under the editor routes' base: a
 * PDF's page, the built viewer, and the bytes of the PDF a page is loading.
 * Authentication is the caller's, as for the editor's pages.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { injectShim, socketSource } from "./page";
import { pdfQuery } from "./page-query";
import { PdfPages, type PdfPage } from "./pdf-pages";
import { resolveContainedNote } from "./paths";
import { serveStatic } from "./static";

export interface PdfRouteOptions {
  /** The editor routes' base path (`/lumiere`). */
  readonly base: string;
  /** The built viewer (`packages/pdf/dist/webview`). */
  readonly viewer: string;
  readonly log: (message: string) => void;
}

export interface PdfRoutes {
  /** Answer `rest` (the path after the base); false when it is not a PDF route. */
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    rest: string,
  ): Promise<boolean>;
  /** The open PDF page with this id, for its socket. */
  page(id: string): PdfPage | undefined;
  close(): void;
}

/** An embedder that ships no PDF viewer: PDFs do not open. */
export const NO_PDF_ROUTES: PdfRoutes = {
  handle: async () => false,
  page: () => undefined,
  close: () => {},
};

export function createPdfRoutes(options: PdfRouteOptions): PdfRoutes {
  const pages = new PdfPages();
  return {
    async handle(req, res, rest) {
      const url = new URL(req.url ?? "/", "http://host");
      if (rest === "/pdf") {
        await servePdfPage({ req, res, url, pages, options });
      } else if (rest.startsWith("/pdf/viewer/")) {
        await serveStatic(
          res,
          options.viewer,
          rest.slice("/pdf/viewer/".length),
        );
      } else if (rest === "/pdf/bytes") {
        serveBytes(res, url, pages);
      } else {
        return false;
      }
      return true;
    },
    page: (id) => pages.get(id),
    close: () => pages.dispose(),
  };
}

interface PdfPageRequest {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly pages: PdfPages;
  readonly options: PdfRouteOptions;
}

async function servePdfPage({
  req,
  res,
  url,
  pages,
  options,
}: PdfPageRequest): Promise<void> {
  const query = pdfQuery(url);
  if (!query) {
    res.writeHead(400, { "content-type": "text/plain" }).end("Not a PDF");
    return;
  }
  // Both canonical, and the PDF inside the workspace even through symlinks.
  const resolved = await resolveContainedNote(query.note, query.root);
  if (!resolved) {
    res.writeHead(403).end();
    return;
  }
  const { base } = options;
  const page = pages.open({
    uri: pathToFileURL(resolved.note).toString(),
    root: pathToFileURL(resolved.root).toString(),
    cspSource: socketSource(req.headers.host ?? ""),
    // The editor ships the same PDF engine (both pin one @embedpdf/pdfium).
    asset: (name) =>
      name === "pdfium.wasm"
        ? `${base}/m/webview/pdfium.wasm`
        : `${base}/pdf/viewer/${name}`,
    bytesUrl: (id, load) =>
      `${base}/pdf/bytes?page=${encodeURIComponent(id)}&load=${load}`,
    log: options.log,
  });
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(injectShim(page.html, page.id, `${base}/page/shim.js`));
}

/** The bytes of the load a page asked for, while it is that page's newest. */
function serveBytes(res: ServerResponse, url: URL, pages: PdfPages): void {
  const page = pages.get(url.searchParams.get("page") ?? "");
  const bytes = page?.bytesOf(Number(url.searchParams.get("load")));
  if (!bytes) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-type": "application/pdf",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(Buffer.from(bytes));
}
