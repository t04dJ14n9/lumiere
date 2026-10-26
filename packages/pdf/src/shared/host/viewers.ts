import type { HostMessage, PdfDelivery } from "../messages";

/**
 * The viewer page of one open PDF, as its host shows it: in VS Code a
 * webview, elsewhere a page served by the host. Messages in both
 * directions are the ones in `shared/messages.ts`; what the page sends is
 * untrusted and parsed by the panel.
 */
export interface PdfWebview {
  /** The page's own origin, for its content security policy. */
  readonly cspSource: string;
  /** The URL of a built viewer file (`viewer.js`, `viewer.css`, `pdfium.wasm`). */
  asset(name: string): string;
  setHTML(html: string): void;
  post(message: HostMessage): void;
  onMessage(listener: (message: unknown) => void): () => void;
  /** How the bytes of load number `load` reach this page (see `PdfDelivery`). */
  deliver(bytes: ArrayBuffer, load: number): PdfDelivery;
}
