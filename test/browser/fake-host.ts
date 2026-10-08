import type { Context } from "../../src/kernel";
import { Endpoint } from "../../src/shared/rpc/endpoint";
import type {
  HostDocument,
  Workbench,
  PanelShell,
} from "../../src/shared/runtime";
import { SourceCoordinates } from "../../src/shared/document/coordinates";
import { Session } from "../../src/plugins/document/session";
import {
  protocol as editorProtocol,
  viewState,
} from "../../src/plugins/editor/protocol";
import { protocol as commandProtocol } from "../../src/plugins/commands/protocol";
import { bootstrap } from "../../src/webview/bootstrap";
export class BrowserHost {
  text: string;
  saved: string;
  version = 1;
  delay = 0;
  private history: string[];
  private cursor = 0;
  readonly endpoints: Endpoint[] = [];
  readonly views: Context[] = [];
  readonly session: Session;
  clipboard = "";
  private readonly saves = new Set<(doc: HostDocument) => void>();
  readonly document: HostDocument;
  constructor(source: string) {
    this.text = this.saved = source;
    this.history = [source];
    // Accessor descriptors below must read the owning fake host.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.document = {
      id: "note",
      uri: "file:///fixture/Note.md",
      get version() {
        return self.version;
      },
      get isDirty() {
        return self.text !== self.saved;
      },
      isUntitled: false,
      get eol() {
        return self.text.includes("\r\n") ? "\r\n" : "\n";
      },
      getText: () => this.text,
      async save() {
        self.saved = self.text;
        for (const listener of self.saves) {
          listener(self.document);
        }
        return true;
      },
    };
    const workbench: Workbench = {
      fingerprint: (text) => text,
      files: async () => [],
      read: async () => new Uint8Array(),
      stat: async () => ({ mtime: 0, symbolicLink: false }),
      async apply(_document, edits) {
        const coordinates = new SourceCoordinates(self.text);
        for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
          self.text =
            self.text.slice(0, coordinates.toSource(edit.from)) +
            edit.insert +
            self.text.slice(coordinates.toSource(edit.to));
        }
        self.version++;
        self.history.splice(self.cursor + 1);
        self.history.push(self.text);
        self.cursor++;
        self.session.changed();
        return true;
      },
      async execute(action) {
        if (action === "undo") {
          self.cursor = Math.max(0, self.cursor - 1);
        } else if (action === "redo") {
          self.cursor = Math.min(self.history.length - 1, self.cursor + 1);
        }
        self.text = self.history[self.cursor]!;
        self.version++;
        self.session.changed();
      },
      onChange: () => () => {},
      onWillSave: () => () => {},
      onSave(listener) {
        self.saves.add(listener);
        return () => {
          self.saves.delete(listener);
        };
      },
      command: () => () => {},
      clipboard: {
        read: async () => self.clipboard,
        write: async (value) => {
          self.clipboard = value;
        },
      },
      error(message) {
        throw new Error(message);
      },
      registerEditor: (_open: (panel: PanelShell) => void) => () => {},
      config: () => ({ preset: "obsidian", mode: "livePreview" }),
      root: () => "file:///fixture",
    };
    this.session = new Session(this.document, workbench);
  }
  async open(
    preset: "minimal" | "obsidian" = "obsidian",
    mode: "source" | "livePreview" = "livePreview",
  ) {
    const parent = document.createElement("section");
    parent.className = "panel";
    document.getElementById("app")!.append(parent);
    let receiveHost: (message: unknown) => void = () => {};
    let receiveView: (message: unknown) => void = () => {};
    const clock = {
      after(ms: number, callback: () => void) {
        const timer = setTimeout(callback, ms);
        return () => clearTimeout(timer);
      },
    };
    const host = new Endpoint(
      {
        send: (message) => {
          setTimeout(() => receiveView(structuredClone(message)), this.delay);
        },
        listen: (receive) => {
          receiveHost = receive;
          return () => {
            receiveHost = () => {};
          };
        },
      },
      clock,
    );
    const view = new Endpoint(
      {
        send: (message) => {
          setTimeout(() => receiveHost(structuredClone(message)), this.delay);
        },
        listen: (receive) => {
          receiveView = receive;
          return () => {
            receiveView = () => {};
          };
        },
      },
      clock,
    );
    const id = String(this.endpoints.length);
    this.endpoints.push(host);
    host.handle(editorProtocol, "ready", () => {
      this.session.attach(id, host);
      return {
        text: this.session.text,
        version: this.session.version,
        features: {},
        editor: { useTabs: true, tabSize: 4 },
        trusted: false,
        clientID: id,
        source: this.document.uri,
        preset,
        mode,
      };
    });
    host.handle(editorProtocol, "clipboardRead", () => this.clipboard);
    host.handle(editorProtocol, "clipboardWrite", ({ text }) => {
      this.clipboard = text;
      return true;
    });
    host.handle(commandProtocol, "action", async ({ action }) => {
      await this.session.flush();
      if (action === "save") {
        await this.session.save();
      }
      if (action === "undo" || action === "redo") {
        await this.session.history(action);
      }
      return true;
    });
    const context = await bootstrap(view, parent);
    this.views.push(context);
    return context;
  }
  async restore(
    state: {
      anchor: number;
      head: number;
      scrollTop: number;
      mode: "source" | "livePreview";
    },
    panel = 0,
  ) {
    return this.endpoints[panel]!.call(
      editorProtocol,
      "restoreView",
      viewState.parse(state),
    );
  }
  async viewState(panel = 0) {
    return this.endpoints[panel]!.call(editorProtocol, "captureView", {});
  }
  async capture(panel = 0) {
    return this.endpoints[panel]!.call(editorProtocol, "captureSelection", {});
  }
  async reveal(from: number, to = from, panel = 0) {
    return this.endpoints[panel]!.call(editorProtocol, "reveal", {
      from,
      to,
      focus: true,
    });
  }
  async mode(panel = 0) {
    return this.endpoints[panel]!.call(commandProtocol, "run", {
      command: "editor:toggle-source",
    });
  }
  external(text: string) {
    this.text = text;
    this.version++;
    this.session.changed();
  }
}
declare global {
  interface Window {
    harness: BrowserHost;
    BrowserHost: typeof BrowserHost;
  }
}
window.BrowserHost = BrowserHost;
