/**
 * One editor page, as the editor host sees a VS Code webview panel. The
 * page loads in an iframe of the embedder (DSH's sidebar, the app's tabs) and connects back over
 * a socket; until it does, frames for it wait here.
 */
import type { Disposer } from "@workshop/core";
import type { PanelShell, Transport } from "@workshop/markdown/portable";
import type { NoteDocument } from "./documents";
import {
  parsePageFrame,
  type HostFrame,
  type UiEvent,
  type UiRequest,
} from "../protocol";

/** The page's end of a socket, as the panel uses it. */
export interface PageSocket {
  send(text: string): void;
  onMessage(listener: (text: string) => void): Disposer;
  onClose(listener: () => void): Disposer;
  close(): void;
}

/** Where the panel's page and its files are served. */
export interface PanelUrls {
  /** `'self'` plus the socket's origin, for the page's content security policy. */
  readonly cspSource: string;
  asset(relative: string): string;
  resource(uri: string): string;
}

let questions = 0;

/** A fresh id for a question to a page; ids never repeat within the host. */
export function questionId(): number {
  return ++questions;
}

/** A UI request that waits for the page's answer. */
type Question = Extract<UiRequest, { type: "ask" | "pick" | "input" }>;
type Answer = string | number | null;

export class LivePanel {
  readonly shell: PanelShell;
  private socket: PageSocket | undefined;
  private readonly waiting: string[] = [];
  private readonly receivers = new Set<(message: unknown) => void>();
  private readonly disposeListeners = new Set<() => void>();
  private readonly uiListeners = new Set<(event: UiEvent) => void>();
  private readonly stateListeners = new Set<() => void>();
  private readonly answers = new Map<number, (answer: Answer) => void>();
  private html: (value: string) => void = () => {};
  private disposed = false;
  /** The page's HTML, once the editor host sets it. */
  readonly page: Promise<string>;

  constructor(
    readonly id: string,
    readonly document: NoteDocument,
    urls: PanelUrls,
    private readonly isActive: (panel: LivePanel) => boolean,
  ) {
    this.page = new Promise((resolve) => {
      this.html = resolve;
    });
    this.shell = this.createShell(urls);
  }

  /** The page connected; send what waited for it. A second socket replaces the first. */
  attach(socket: PageSocket): void {
    this.socket?.close();
    this.socket = socket;
    socket.onMessage((text) => this.receive(text));
    socket.onClose(() => {
      if (this.socket === socket) {
        this.dispose();
      }
    });
    for (const text of this.waiting.splice(0)) {
      socket.send(text);
    }
  }

  /** Show something on the page; nothing comes back. */
  tell(request: Exclude<UiRequest, Question>): void {
    this.send({ ch: "ui", data: request });
  }

  /** Ask the page; resolves with its answer, or null if it closes first. */
  ask(request: Question): Promise<Answer> {
    return new Promise((resolve) => {
      if (this.disposed) {
        resolve(null);
        return;
      }
      this.answers.set(request.id, resolve);
      this.send({ ch: "ui", data: request });
    });
  }

  onUi(listener: (event: UiEvent) => void): () => void {
    this.uiListeners.add(listener);
    return () => {
      this.uiListeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.socket?.close();
    for (const answer of this.answers.values()) {
      answer(null);
    }
    this.answers.clear();
    for (const listener of this.disposeListeners) {
      listener();
    }
  }

  private send(frame: HostFrame): void {
    const text = JSON.stringify(frame);
    if (this.socket) {
      this.socket.send(text);
    } else {
      this.waiting.push(text);
    }
  }

  private receive(text: string): void {
    const frame = parsePageFrame(text);
    if (!frame) {
      return;
    }
    if (frame.ch === "rpc") {
      for (const receiver of this.receivers) {
        receiver(frame.data);
      }
      return;
    }
    if (frame.data.type === "answer") {
      this.answers.get(frame.data.id)?.(frame.data.value);
      this.answers.delete(frame.data.id);
    }
    for (const listener of this.uiListeners) {
      listener(frame.data);
    }
    // Focus is the panel's view state here: it decides which panel is active.
    if (frame.data.type === "focus" || frame.data.type === "blur") {
      for (const listener of this.stateListeners) {
        listener();
      }
    }
  }

  private createShell(urls: PanelUrls): PanelShell {
    const transport: Transport = {
      send: (message) => this.send({ ch: "rpc", data: message }),
      listen: (receive) => {
        this.receivers.add(receive);
        return () => {
          this.receivers.delete(receive);
        };
      },
    };
    return {
      id: this.id,
      // No editor groups outside VS Code: every panel is in the one column.
      column: 1,
      document: this.document,
      transport,
      cspSource: urls.cspSource,
      trusted: true,
      active: () => this.isActive(this),
      reveal: () => {},
      dispose: () => this.dispose(),
      setHTML: (html) => this.html(html),
      asset: (relative) => urls.asset(relative),
      resource: (uri) => urls.resource(uri),
      onDispose: (listener) => {
        this.disposeListeners.add(listener);
        return () => {
          this.disposeListeners.delete(listener);
        };
      },
      onState: (listener) => {
        this.stateListeners.add(listener);
        return () => {
          this.stateListeners.delete(listener);
        };
      },
    };
  }
}
