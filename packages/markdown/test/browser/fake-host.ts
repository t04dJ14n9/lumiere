import { fakeHost } from "../support/vscode-fake";
import { protocol as jumpProtocol } from "../../src/plugins/editor/jump-protocol";
import { config as editorConfig } from "../../src/plugins/editor/manifest";
import type { RootContext } from "@workshop/core";
import { Endpoint } from "../../src/shared/rpc/endpoint";
import type { HostDocument, HostServices } from "../../src/shared/host";
import { SourceCoordinates } from "../../src/shared/document/coordinates";
import { Session } from "../../src/plugins/document/session";
import {
  protocol as editorProtocol,
  viewState,
} from "../../src/plugins/editor/protocol";
import { protocol as commandProtocol } from "../../src/plugins/commands/protocol";
import { protocol as gitGutterProtocol } from "../../src/plugins/gitGutter/protocol";
import { protocol as linksProtocol } from "../../src/plugins/links/protocol";
import { protocol as propertiesProtocol } from "../../src/plugins/properties/protocol";
import { frontmatter } from "../../src/markdown/properties";
import type { PropertyTypes } from "../../src/markdown/properties/types";
import { protocol as videoProtocol } from "../../src/plugins/onlineVideos/protocol";
import { bootstrap } from "../../src/webview/bootstrap";
import { setTitle } from "../../src/plugins/inlineTitle/widget";
export class BrowserHost {
  text: string;
  saved: string;
  version = 1;
  delay = 0;
  private history: string[];
  private cursor = 0;
  readonly endpoints: Endpoint[] = [];
  private readonly navigationSessions = new Map<string, string>();
  private navigationRequest = 0;
  readonly views: RootContext[] = [];
  readonly session: Session;
  clipboard = "";
  propertyTypes: PropertyTypes = {};
  propertyNames: string[] = ["status", "list"];
  propertiesCollapsed = false;
  /** Workspace trust sent to the editor; set before `open`. */
  trusted = false;
  /** Links the editor asked the host to open. */
  readonly opened: string[] = [];
  /** Per-plugin settings sent to the editor; set before `open`. */
  features: Record<
    string,
    { enabled: boolean; config: Record<string, unknown> }
  > = {};
  /** Online video details by `provider:id`; others fail as if offline. */
  videoDetails: Record<string, Record<string, unknown>> = {};
  readonly videoRequests: string[] = [];
  /** The git baseline the change bars compare with; undefined: no repository. */
  gitBaseline: string | undefined;
  /** How many times the editor asked to stage the note. */
  gitStaged = 0;
  private readonly saves = new Set<(doc: HostDocument) => void>();
  readonly document: HostDocument;

  /** Push an inline-title value (browser remount / height probes). */
  applyTitle(title: string, error?: string): void {
    const fiber = [...this.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "inlineTitle",
    );
    const view = fiber?.context?.editor.view;
    if (!view) {
      throw new Error("inlineTitle is not active");
    }
    view.dispatch({
      effects: setTitle.of(error === undefined ? { title } : { title, error }),
    });
  }

  /** Tell open editors the repository changed (a commit, a stage). */
  gitChanged(): void {
    this.endpoints.forEach((endpoint) =>
      endpoint.notify(gitGutterProtocol, "changed", {}),
    );
  }
  constructor(source: string) {
    this.text = this.saved = source;
    this.history = [source];
    // Accessor descriptors below must read the owning fake host.
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- accessors below must read the fake host
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
    const host: HostServices = fakeHost({
      hostDocuments: {
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
        onSave(listener) {
          self.saves.add(listener);
          return () => {
            self.saves.delete(listener);
          };
        },
      },
      hostCommands: {
        async execute(action) {
          if (action === "undo") {
            self.cursor = Math.max(0, self.cursor - 1);
          } else if (action === "redo") {
            self.cursor = Math.min(self.history.length - 1, self.cursor + 1);
          }
          self.text = self.history[self.cursor]!;
          self.version++;
          self.session.changed();
          return undefined;
        },
      },
      clipboard: {
        read: async () => self.clipboard,
        write: async (value) => {
          self.clipboard = value;
        },
      },
      dialogs: {
        error(message) {
          throw new Error(message);
        },
      },
      settings: {
        forNote: () => ({ preset: "obsidian", mode: "livePreview" }),
      },
    });
    this.session = new Session(this.document, host);
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
        debugLogging: false,
        features: this.features,
        editor: editorConfig.parse({}),
        trusted: this.trusted,
        clientID: id,
        source: this.document.uri,
        preset,
        mode,
      };
    });
    host.handle(jumpProtocol, "record", () => true);
    host.handle(linksProtocol, "ready", ({ session }) => {
      this.navigationSessions.set(id, session);
      return true;
    });
    host.handle(linksProtocol, "missing", () => true);
    host.handle(linksProtocol, "open", ({ href }) => {
      this.opened.push(href);
      return true;
    });
    host.handle(videoProtocol, "details", ({ provider, id }) => {
      const key = `${provider}:${id}`;
      this.videoRequests.push(key);
      const details = this.videoDetails[key];
      if (!details) {
        throw new Error("offline");
      }
      return details;
    });
    host.handle(propertiesProtocol, "types", () => this.propertyTypes);
    host.handle(propertiesProtocol, "names", () => [
      ...new Set([
        ...this.propertyNames,
        ...Object.keys(frontmatter(this.text)?.values ?? {}),
        ...Object.keys(this.propertyTypes),
      ]),
    ]);
    host.handle(propertiesProtocol, "setType", ({ key, kind }) => {
      const types = { ...this.propertyTypes };
      if (kind) {
        types[key.toLowerCase()] = kind;
      } else {
        delete types[key.toLowerCase()];
      }
      this.propertyTypes = types;
      this.endpoints.forEach((endpoint) =>
        endpoint.notify(propertiesProtocol, "types", types),
      );
      return types;
    });
    host.handle(
      propertiesProtocol,
      "collapsed",
      () => this.propertiesCollapsed,
    );
    host.handle(propertiesProtocol, "setCollapsed", ({ collapsed }) => {
      this.propertiesCollapsed = collapsed;
      this.endpoints.forEach((endpoint) =>
        endpoint.notify(propertiesProtocol, "collapsed", collapsed),
      );
      return collapsed;
    });
    host.handle(gitGutterProtocol, "baseline", () =>
      this.gitBaseline === undefined
        ? { status: "unavailable" as const }
        : {
            status: "ok" as const,
            text: this.gitBaseline,
            label: "HEAD (abc1234)",
          },
    );
    host.handle(gitGutterProtocol, "stage", () => {
      this.gitStaged++;
      return true;
    });
    host.handle(gitGutterProtocol, "mutationLock", () => true);
    host.handle(gitGutterProtocol, "openFullDiff", () => true);
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
  navigationReady(panel = 0) {
    return this.navigationSessions.has(String(panel));
  }
  /** Sends the navigation the host sends when the outline or a link opens a note at a place. */
  navigate(target: { fragment: string; at?: number }, panel = 0) {
    return this.endpoints[panel]!.call(linksProtocol, "navigate", {
      ...target,
      session: this.navigationSessions.get(String(panel)) ?? "",
      requestId: ++this.navigationRequest,
    });
  }
  /** Sends editor settings as the host does when VS Code's change. */
  configureEditor(settings: Record<string, unknown>, panel = 0) {
    this.endpoints[panel]!.notify(
      editorProtocol,
      "configureEditor",
      editorConfig.parse(settings),
    );
  }
  /** Run a webview editor command, as the command palette does. */
  async run(command: string, panel = 0) {
    return this.endpoints[panel]!.call(commandProtocol, "run", { command });
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
