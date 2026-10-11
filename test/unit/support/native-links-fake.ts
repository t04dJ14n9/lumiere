import type * as V from "vscode";
import path from "node:path";
export class Disposable {
  constructor(private readonly stop: () => void = () => {}) {}
  dispose() {
    this.stop();
  }
  static from(...items: Disposable[]) {
    return new Disposable(() => items.forEach((item) => item.dispose()));
  }
}
class Signal<T> {
  private listeners = new Set<(event: T) => void>();
  event = (listener: (event: T) => void) => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  fire(event: T) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
  get size() {
    return this.listeners.size;
  }
}
export class Uri {
  constructor(
    readonly scheme: string,
    readonly path: string,
    readonly fragment = "",
    readonly query = "",
  ) {}
  static parse(value: string) {
    const url = new URL(value);
    return new Uri(
      url.protocol.slice(0, -1),
      decodeURIComponent(url.pathname),
      url.hash.slice(1),
      url.search.slice(1),
    );
  }
  static joinPath(base: Uri, ...parts: string[]) {
    return new Uri(base.scheme, path.posix.join(base.path, ...parts));
  }
  with(parts: { fragment?: string }) {
    return new Uri(
      this.scheme,
      this.path,
      parts.fragment ?? this.fragment,
      this.query,
    );
  }
  toString() {
    return `${this.scheme}:${this.scheme === "file" ? "//" : ""}${this.path}${this.query ? "?" + this.query : ""}${this.fragment ? "#" + this.fragment : ""}`;
  }
}
export class Range {
  constructor(
    readonly start: unknown,
    readonly end: unknown,
  ) {}
}
export class DocumentLink {
  constructor(
    readonly range: Range,
    readonly target: Uri,
  ) {}
}
export class TabInputText {
  constructor(readonly uri: Uri) {}
}
export class TabInputCustom {
  constructor(readonly uri: Uri) {}
}
export const FileType = { File: 1 };
export const TextEditorSelectionChangeKind = {
  Keyboard: 1,
  Mouse: 2,
  Command: 3,
};
const tabs = new Signal<void>();
const groups = new Signal<void>();
const active = new Signal<void>();
const selection = new Signal<V.TextEditorSelectionChangeEvent>();
const ranges = new Signal<V.TextEditorVisibleRangesChangeEvent>();
const changes = new Signal<V.TextDocumentChangeEvent>();
let provider: V.DocumentLinkProvider;
let command: (payload: unknown, signature: unknown) => Promise<boolean>;
const document = {
  uri: new Uri("file", "/vault/source.md"),
  version: 1,
  getText: () => text,
  positionAt: (at: number) => ({ line: 0, character: at }),
  offsetAt: (position: { character: number }) => position.character,
};
let text = "[One](target.md#one) [Two](target.md#two)";
const editor = { document, viewColumn: 1, visibleRanges: [] };
export const window = {
  activeTextEditor: editor,
  onDidChangeActiveTextEditor: active.event,
  onDidChangeTextEditorVisibleRanges: ranges.event,
  onDidChangeTextEditorSelection: selection.event,
  showWarningMessage: async (message: string) => {
    warnings.push(message);
  },
  tabGroups: {
    activeTabGroup: {
      viewColumn: 1,
      activeTab: {
        input: new TabInputText(document.uri) as TabInputText | undefined,
      },
    },
    onDidChangeTabs: tabs.event,
    onDidChangeTabGroups: groups.event,
  },
};
export const workspace = {
  getWorkspaceFolder: () => ({ uri: new Uri("file", "/vault") }),
  textDocuments: [document],
  fs: { stat: async () => ({ type: 1 }) },
  onDidChangeTextDocument: changes.event,
};
export const languages = {
  registerDocumentLinkProvider: (
    _selector: unknown,
    value: V.DocumentLinkProvider,
  ) => {
    provider = value;
    return new Disposable();
  },
};
export const commands = {
  registerCommand: (_name: string, value: typeof command) => {
    command = value;
    return new Disposable();
  },
};
const warnings: string[] = [];
export const driver = {
  reset() {
    document.version = 1;
    text = "[One](target.md#one) [Two](target.md#two)";
    window.activeTextEditor = editor;
    this.tab("source.md");
    warnings.length = 0;
  },
  async tickets() {
    const links = await provider.provideDocumentLinks(
      document as unknown as V.TextDocument,
      { isCancellationRequested: false } as V.CancellationToken,
    );
    return (links ?? []).map(
      (link) =>
        JSON.parse(decodeURIComponent(link.target!.query)) as [string, string],
    );
  },
  invoke(ticket: [string, string]) {
    return command(...ticket);
  },
  tab(name: string, column = 1) {
    window.tabGroups.activeTabGroup = {
      viewColumn: column,
      activeTab: { input: new TabInputText(new Uri("file", `/vault/${name}`)) },
    };
    tabs.fire();
  },
  unknownTab() {
    window.tabGroups.activeTabGroup.activeTab.input = undefined;
    tabs.fire();
  },
  scroll() {
    ranges.fire({
      textEditor: editor,
      visibleRanges: [{ start: { line: 4 }, end: { line: 14 } }],
    } as unknown as V.TextEditorVisibleRangesChangeEvent);
  },
  edit() {
    document.version++;
    changes.fire({ document } as unknown as V.TextDocumentChangeEvent);
  },
  caret(at: number, kind = 2) {
    selection.fire({
      textEditor: editor,
      kind,
      selections: [{ active: { character: at } }],
    } as unknown as V.TextEditorSelectionChangeEvent);
  },
  get listeners() {
    return (
      tabs.size +
      groups.size +
      active.size +
      selection.size +
      changes.size +
      ranges.size
    );
  },
  get warnings() {
    return warnings;
  },
};
