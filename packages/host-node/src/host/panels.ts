/**
 * Every open editor page, and the custom editor registry the editor host
 * registers Lumière's editor with (VS Code's `registerCustomEditorProvider`).
 */
import type { Disposer } from "@workshop/core";
import {
  MARKDOWN_EDITOR,
  type CustomEditors,
  type EditorProvider,
  type PanelShell,
} from "@workshop/markdown/portable";
import type { NoteDocuments } from "./documents";
import { LivePanel, type PageSocket, type PanelUrls } from "./panel";

/** How long the editor host may take to give a new panel its HTML. */
const PAGE_TIMEOUT_MS = 15_000;
/** How long a page may take to connect after it was served. */
const CONNECT_TIMEOUT_MS = 60_000;

export interface PageRequest {
  /** The note's file URI. */
  readonly uri: string;
  readonly urls: (panelId: string) => PanelUrls;
}

export class PanelHub implements CustomEditors {
  private editor: ((panel: PanelShell) => void) | undefined;
  private readonly panels = new Map<string, LivePanel>();
  private readonly connected = new Set<string>();
  private activeId: string | undefined;
  private readonly activeListeners = new Set<() => void>();
  private readonly openedListeners = new Set<(panel: LivePanel) => void>();

  constructor(
    private readonly documents: NoteDocuments,
    private readonly connectTimeout = CONNECT_TIMEOUT_MS,
  ) {}

  register(
    provider: EditorProvider,
    open: (panel: PanelShell) => void,
  ): Disposer {
    if (provider.viewType !== MARKDOWN_EDITOR.viewType) {
      return () => {};
    }
    this.editor = open;
    return () => {
      if (this.editor === open) {
        this.editor = undefined;
      }
    };
  }

  /** A new page for a note: its panel joins the editor host, which sets its HTML. */
  async open(request: PageRequest): Promise<{ id: string; html: string }> {
    const open = this.editor;
    if (!open) {
      throw new Error("Lumière's editor has not started yet");
    }
    const document = await this.documents.open(request.uri);
    this.documents.retain(document.uri);
    const id = panelId();
    const panel = new LivePanel(
      id,
      document,
      request.urls(id),
      (item) => item.id === this.activeId,
    );
    this.panels.set(id, panel);
    panel.shell.onDispose(() => this.forget(panel));
    panel.onUi((event) => {
      if (event.type === "focus") {
        this.activate(panel.id);
      }
    });
    open(panel.shell);
    for (const listener of this.openedListeners) {
      listener(panel);
    }
    try {
      const html = await within(panel.page, PAGE_TIMEOUT_MS);
      this.expireUnlessConnected(panel);
      return { id, html };
    } catch (error) {
      panel.dispose();
      throw error;
    }
  }

  /** The page of panel `id` connected; false if there is no such panel. */
  attach(id: string, socket: PageSocket): boolean {
    const panel = this.panels.get(id);
    if (!panel) {
      return false;
    }
    this.connected.add(id);
    panel.attach(socket);
    return true;
  }

  get(id: string): LivePanel | undefined {
    return this.panels.get(id);
  }

  all(): readonly LivePanel[] {
    return [...this.panels.values()];
  }

  /** The panel the reader last focused, while it is open. */
  active(): LivePanel | undefined {
    return this.activeId ? this.panels.get(this.activeId) : undefined;
  }

  onActiveChanged(listener: () => void): () => void {
    this.activeListeners.add(listener);
    return () => {
      this.activeListeners.delete(listener);
    };
  }

  /** A new panel joined the editor host (a note opened in another tab). */
  onOpened(listener: (panel: LivePanel) => void): () => void {
    this.openedListeners.add(listener);
    return () => {
      this.openedListeners.delete(listener);
    };
  }

  dispose(): void {
    for (const panel of this.all()) {
      panel.dispose();
    }
  }

  private activate(id: string | undefined): void {
    if (this.activeId === id) {
      return;
    }
    this.activeId = id;
    for (const listener of this.activeListeners) {
      listener();
    }
  }

  private forget(panel: LivePanel): void {
    this.panels.delete(panel.id);
    this.connected.delete(panel.id);
    void this.documents.release(panel.document.uri);
    if (this.activeId === panel.id) {
      this.activate(undefined);
    }
  }

  /** A page that never connects (its iframe failed to load) must not hold the note open. */
  private expireUnlessConnected(panel: LivePanel): void {
    const timer = setTimeout(() => {
      if (!this.connected.has(panel.id)) {
        panel.dispose();
      }
    }, this.connectTimeout);
    // Node keeps a process alive for a timer; a browser has no unref.
    (timer as { unref?: () => void }).unref?.();
  }
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Lumière's editor did not render the note")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * A page's panel id: 128 random bits. Not `crypto.randomUUID`, which a
 * browser offers only in a secure context.
 */
function panelId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
