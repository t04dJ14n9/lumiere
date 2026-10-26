/**
 * An editor page without a server: the editor's HTML, with the page shim
 * (`@workshop/host-node` src/page/shim.ts), as a blob: document the window
 * shows in an iframe, or at a URL of the embedder's (`servePage`). Either
 * keeps the window's origin, which the editor's transport checks. The page talks to its panel over a channel the
 * window hands it (`connect`), since there is no socket to open.
 */
import {
  injectShim,
  type LumiereHost,
  type PageSocket,
} from "@workshop/host-node/core";
import { PDF_META, TRANSPORT_META } from "@workshop/host-node/embedding";
import { PAGE_TOOLBAR, viewerPageHtml } from "@workshop/pdf/viewer-page";

export interface EditorPageUrls {
  /** The window's origin, for the page's content security policy. */
  readonly origin: string;
  /** Where the built editor is (`…/markdown/`), as an absolute URL. */
  readonly editor: string;
  /** The built page shim, as an absolute URL. */
  readonly shim: string;
  /** A file the note shows (an image): a URL the window can answer. */
  resource(panelId: string, uri: string): string;
  /**
   * Where a note's page is shown from, or undefined for a blob: URL (the
   * default). Chromium sends a blob: page's requests past the window's
   * service worker, so the web app has its worker serve the page instead.
   */
  servePage?(html: string): ServedPage | undefined;
  /** A PDF's page (`openPdfPage`), as absolute URLs. */
  readonly pdf: {
    /** The folder of the built viewer: viewer.js, viewer.css, pdfium.wasm. */
    readonly viewer: string;
    /** The built stand-in for its host (host-node's src/page/pdf-shim.ts). */
    readonly shim: string;
  };
}

/** A page's HTML at a URL a frame can show, until it is disposed. */
export interface ServedPage {
  readonly url: string;
  dispose(): void;
}

export interface EditorPage {
  readonly id: string;
  /** The page, for the iframe's `src`. */
  readonly url: string;
  /** The channel to the page's panel; the window posts the port to the page. */
  connect(): MessagePort;
  /** The tab closed: the panel writes its note and goes. */
  dispose(): void;
}

/** Open `uri`, a note in the vault at `root`, in a new page. */
export async function openEditorPage(
  host: Pick<LumiereHost, "panels" | "addRoot">,
  note: { readonly uri: string; readonly root: string },
  urls: EditorPageUrls,
): Promise<EditorPage> {
  // The vault is a root before the panel opens: the editor finds the note's
  // vault as it starts, and a note outside every root gets only the files
  // beside it. From a folder that reads fast (IndexedDB, memory), the first
  // note opened in a vault found no image or note in its subfolders.
  host.addRoot(note.root);
  const { id, html } = await host.panels.open({
    uri: note.uri,
    urls: (panelId) => ({
      cspSource: urls.origin,
      asset: (relative) => new URL(relative, urls.editor).href,
      resource: (uri) => urls.resource(panelId, uri),
    }),
  });
  const page = injectShim(html, id, urls.shim).replace(
    "<head>",
    `<head><meta name="${TRANSPORT_META}" content="channel">` +
      `<meta name="lumiere-state" content="${escape(note.uri)}">`,
  );
  const served = urls.servePage?.(page) ?? blobPage(page);
  let socket: PortSocket | undefined;
  return {
    id,
    url: served.url,
    connect() {
      socket?.close();
      const channel = new MessageChannel();
      socket = new PortSocket(channel.port1);
      host.panels.attach(id, socket);
      return channel.port2;
    },
    dispose() {
      served.dispose();
      socket?.close();
    },
  };
}

function blobPage(html: string): ServedPage {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  return { url, dispose: () => URL.revokeObjectURL(url) };
}

/** A page's socket over a `MessagePort`, which has no close event of its own. */
class PortSocket implements PageSocket {
  private readonly closeListeners = new Set<() => void>();
  private closed = false;

  constructor(private readonly port: MessagePort) {}

  send(text: string): void {
    if (!this.closed) {
      this.port.postMessage(text);
    }
  }

  onMessage(listener: (text: string) => void): () => void {
    const receive = (event: MessageEvent) => listener(String(event.data));
    this.port.addEventListener("message", receive);
    this.port.start();
    return () => this.port.removeEventListener("message", receive);
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.port.close();
    for (const listener of this.closeListeners) {
      listener();
    }
  }
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

/**
 * Show a PDF in a new page: Lumière's PDF viewer, as in VS Code, with a
 * stand-in for its extension host that hands it these bytes (host-node's
 * src/page/pdf-shim.ts). Closing the tab frees both blobs.
 */
export function openPdfPage(
  bytes: Uint8Array,
  urls: EditorPageUrls,
): { readonly url: string; dispose(): void } {
  // A copy in a plain ArrayBuffer, as a Blob takes.
  const pdf = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const html = viewerPageHtml({
    asset: (name) => new URL(name, urls.pdf.viewer).href,
    cspSource: urls.origin,
    nonce: randomNonce(),
    toolbar: PAGE_TOOLBAR,
    before: [urls.pdf.shim],
    meta: { [PDF_META]: pdf },
  });
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  return {
    url,
    dispose() {
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(pdf);
    },
  };
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
