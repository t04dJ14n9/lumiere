/**
 * An editor page without a server: the editor's HTML, with the page shim
 * (`@workshop/host-node` src/page/shim.ts), as a blob: document the window
 * shows in an iframe. A blob document keeps the window's origin, which the
 * editor's transport checks. The page talks to its panel over a channel the
 * window hands it (`connect`), since there is no socket to open.
 */
import {
  injectShim,
  type LumiereHost,
  type PageSocket,
} from "@workshop/host-node/core";
import { TRANSPORT_META } from "@workshop/host-node/embedding";

export interface EditorPageUrls {
  /** The window's origin, for the page's content security policy. */
  readonly origin: string;
  /** Where the built editor is (`…/markdown/`), as an absolute URL. */
  readonly editor: string;
  /** The built page shim, as an absolute URL. */
  readonly shim: string;
  /** A file the note shows (an image): a URL the window can answer. */
  resource(panelId: string, uri: string): string;
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
  const { id, html } = await host.panels.open({
    uri: note.uri,
    urls: (panelId) => ({
      cspSource: urls.origin,
      asset: (relative) => new URL(relative, urls.editor).href,
      resource: (uri) => urls.resource(panelId, uri),
    }),
  });
  host.addRoot(note.root);
  const page = injectShim(html, id, urls.shim).replace(
    "<head>",
    `<head><meta name="${TRANSPORT_META}" content="channel">` +
      `<meta name="lumiere-state" content="${escape(note.uri)}">`,
  );
  const url = URL.createObjectURL(new Blob([page], { type: "text/html" }));
  let socket: PortSocket | undefined;
  return {
    id,
    url,
    connect() {
      socket?.close();
      const channel = new MessageChannel();
      socket = new PortSocket(channel.port1);
      host.panels.attach(id, socket);
      return channel.port2;
    },
    dispose() {
      URL.revokeObjectURL(url);
      socket?.close();
    },
  };
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
