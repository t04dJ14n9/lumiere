/**
 * PDF tabs outside VS Code: Lumière PDF's viewer page, served by the host
 * over the editor pages' shim and socket (page/shim.ts carries any message).
 * The shared viewer core (`@workshop/pdf/portable`) loads the file, reloads
 * it when it changes, and keeps the reading position and selection. The PDF
 * plugins on top of it (Copy Link for Agent, look up, the outline view) run
 * only in VS Code for now, so their messages are dropped here.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import {
  DEFAULT_FLOATING_DOCK,
  DEFAULT_VIEW_CHOICES,
  PdfViewerPanel,
  type HostMessage,
  type PdfDelivery,
  type PdfFiles,
  type PdfWebview,
  type ReadingPosition,
  type ViewSettings,
} from "@workshop/pdf/portable";
import type { PageSocket } from "./panel";
import { fileUriToPath, pathInsideRoots } from "./paths";
import { parsePageFrame } from "../protocol";
import { watchFile } from "./watch";

/** VS Code's defaults, except the toolbar: there is no editor title bar to hold it. */
const VIEW_SETTINGS: ViewSettings = {
  ...DEFAULT_VIEW_CHOICES,
  defaultZoom: "fitWidth",
  smoothScrolling: true,
};
const TOOLBAR = { mode: "slim", dock: DEFAULT_FLOATING_DOCK } as const;

/** A page that never connects (closed before it loaded) is dropped after this. */
const CONNECT_TIMEOUT_MS = 30_000;

/** Where a PDF page's files are served, and what it may read. */
export interface PdfPageSetup {
  /** The PDF's file URI. */
  readonly uri: string;
  /** The workspace it was opened from, as a file URI: the page reads only inside it. */
  readonly root: string;
  /** `'self'` plus the socket's origin, for the page's content security policy. */
  readonly cspSource: string;
  /** The URL of a built viewer file. */
  asset(name: string): string;
  /** The URL that serves load `load` of page `pageId`. */
  bytesUrl(pageId: string, load: number): string;
  readonly log: (message: string) => void;
}

/** One open PDF tab: the viewer core and the page it drives. */
export class PdfPage implements PdfWebview {
  readonly id = randomUUID();
  readonly cspSource: string;
  /** The page as the viewer core wrote it, before the shim is added. */
  html = "";
  private readonly panel: PdfViewerPanel;
  private socket: PageSocket | undefined;
  private readonly outbox: string[] = [];
  private readonly listeners = new Set<(message: unknown) => void>();
  private readonly closeListeners = new Set<() => void>();
  /** Only the newest load's bytes are kept: an older load's fetch has lost. */
  private bytes: { load: number; data: ArrayBuffer } | undefined;
  private disposed = false;
  private readonly connectTimer: ReturnType<typeof setTimeout>;

  constructor(
    private readonly setup: PdfPageSetup,
    positions: Map<string, ReadingPosition>,
  ) {
    this.cspSource = setup.cspSource;
    this.panel = new PdfViewerPanel(
      setup.uri,
      this,
      {
        files: containedFiles(setup.root),
        error: (message) => setup.log(`PDF: ${message}`),
        // Links in a PDF open only in VS Code for now.
        openExternal: async (url) => setup.log(`PDF link not opened: ${url}`),
        refocus: () => {},
      },
      {
        toolbar: TOOLBAR,
        settings: VIEW_SETTINGS,
        position: positions.get(setup.uri),
        savePosition: (position) => positions.set(setup.uri, position),
        route: async () => {},
      },
    );
    this.connectTimer = setTimeout(() => this.dispose(), CONNECT_TIMEOUT_MS);
  }

  asset(name: string): string {
    return this.setup.asset(name);
  }

  setHTML(html: string): void {
    this.html = html;
  }

  post(message: HostMessage): void {
    const text = JSON.stringify({ ch: "rpc", data: message });
    if (this.socket) {
      this.socket.send(text);
    } else {
      this.outbox.push(text);
    }
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  deliver(bytes: ArrayBuffer, load: number): PdfDelivery {
    this.bytes = { load, data: bytes };
    return { url: this.setup.bytesUrl(this.id, load) };
  }

  /** The bytes of `load`, while it is the newest. */
  bytesOf(load: number): ArrayBuffer | undefined {
    return this.bytes?.load === load ? this.bytes.data : undefined;
  }

  /** The page's socket. The page sends the viewer's messages as `rpc` frames. */
  attach(socket: PageSocket): void {
    if (this.disposed) {
      socket.close();
      return;
    }
    clearTimeout(this.connectTimer);
    this.socket?.close();
    this.socket = socket;
    socket.onMessage((text) => {
      const frame = parsePageFrame(text);
      if (frame?.ch === "rpc") {
        for (const listener of this.listeners) {
          listener(frame.data);
        }
      }
    });
    socket.onClose(() => {
      if (this.socket === socket) {
        this.dispose();
      }
    });
    for (const text of this.outbox.splice(0)) {
      socket.send(text);
    }
  }

  onDispose(listener: () => void): void {
    this.closeListeners.add(listener);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    clearTimeout(this.connectTimer);
    this.panel.dispose();
    this.socket?.close();
    this.bytes = undefined;
    for (const listener of this.closeListeners) {
      listener();
    }
  }
}

/** The open PDF pages, by id; reading positions last as long as the host. */
export class PdfPages {
  private readonly pages = new Map<string, PdfPage>();
  private readonly positions = new Map<string, ReadingPosition>();

  open(setup: PdfPageSetup): PdfPage {
    const page = new PdfPage(setup, this.positions);
    this.pages.set(page.id, page);
    page.onDispose(() => this.pages.delete(page.id));
    return page;
  }

  get(id: string): PdfPage | undefined {
    return this.pages.get(id);
  }

  dispose(): void {
    for (const page of [...this.pages.values()]) {
      page.dispose();
    }
  }
}

/** The PDF's file, read and watched only inside the workspace it opened from. */
function containedFiles(root: string): PdfFiles {
  const rootPath = fileUriToPath(root) ?? "";
  return {
    read: async (uri) => readFile(await pathInsideRoots([root], uri)),
    watch(uri, onChange) {
      const file = fileUriToPath(uri);
      return file ? watchFile(file, onChange) : () => {};
    },
    displayPath(uri) {
      const file = fileUriToPath(uri) ?? uri;
      return path.relative(rootPath, file).split(path.sep).join("/");
    },
  };
}
