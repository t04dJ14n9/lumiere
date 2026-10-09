/**
 * Just enough of the VS Code API for the extension's plugins to activate in
 * unit tests, with every registration tracked: anything a plugin registers
 * (commands, editors, views, status items, listeners, watchers, MCP
 * providers) stays in `outstanding()` until it is disposed. See
 * `install-fake-vscode.ts`, which makes `import 'vscode'` load this file.
 */
type Listener = (value: unknown) => unknown;

const live = new Map<object, string>();

/** Registrations not disposed yet, by kind. */
export function outstanding(): string[] {
  return [...live.values()].sort();
}

/** Forget every registration (after a test that leaks on purpose). */
export function forgetAll(): void {
  live.clear();
}

/** Context keys set with `setContext`, and configuration the fake returns. */
export const contextKeys = new Map<string, unknown>();
export const configuration = new Map<string, unknown>();

export class Disposable {
  static from(...items: ({ dispose(): unknown } | undefined)[]): Disposable {
    return new Disposable(() => {
      for (const item of items) item?.dispose();
    });
  }
  constructor(private callOnDispose?: () => unknown) {}
  dispose(): void {
    const call = this.callOnDispose;
    this.callOnDispose = undefined;
    call?.();
  }
}

function track<T extends object>(kind: string, value: T = {} as T): T & Disposable {
  const handle = Object.assign(value, {
    dispose: () => {
      live.delete(handle);
    },
  });
  live.set(handle, kind);
  return handle as T & Disposable;
}

/** An event whose subscriptions are tracked as `listener:<name>`. */
function event(name: string) {
  return (_listener: Listener) => track(`listener:${name}`);
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(value: T) => unknown>();
  readonly event = (listener: (value: T) => unknown): Disposable => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  fire(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class Uri {
  private constructor(readonly scheme: string, readonly path: string) {}
  static file(path: string): Uri {
    return new Uri('file', path);
  }
  static parse(value: string): Uri {
    const [scheme, rest = ''] = value.split(':', 2);
    return new Uri(scheme ?? 'file', rest.replace(/^\/\//u, ''));
  }
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri(base.scheme, [base.path, ...parts].join('/'));
  }
  get fsPath(): string {
    return this.path;
  }
  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export class RelativePattern {
  constructor(readonly base: unknown, readonly pattern: string) {}
}
export class TreeItem {
  constructor(readonly label: string, readonly collapsibleState?: number) {}
}
export class ThemeIcon {
  constructor(readonly id: string) {}
}
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ConfigurationTarget = { Global: 1, Workspace: 2 };
export const ViewColumn = { Active: -1, Beside: -2, One: 1 };

export const commands = {
  registerCommand: (id: string) => track(`command:${id}`),
  executeCommand: async (id: string, ...args: unknown[]) => {
    if (id === 'setContext') contextKeys.set(String(args[0]), args[1]);
    return undefined;
  },
  getCommands: async () => [] as string[],
};

export const window = {
  registerCustomEditorProvider: (viewType: string) => track(`customEditor:${viewType}`),
  createStatusBarItem: () =>
    track('statusBarItem', { text: '', tooltip: '', command: undefined as unknown, show() {}, hide() {} }),
  createTreeView: (id: string) =>
    track(`treeView:${id}`, {
      visible: false,
      message: undefined as string | undefined,
      onDidChangeVisibility: event('treeView.visibility'),
      reveal: async () => undefined,
    }),
  createOutputChannel: () => track('outputChannel', { info() {}, warn() {}, error() {}, appendLine() {} }),
  showInformationMessage: async (_message: string) => undefined,
  showWarningMessage: async (_message: string) => undefined,
  showErrorMessage: async () => undefined,
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  tabGroups: {
    all: [] as unknown[],
    onDidChangeTabs: event('tabGroups.tabs'),
    onDidChangeTabGroups: event('tabGroups.groups'),
  },
};

export const workspace = {
  getConfiguration: (section = '') => ({
    get: <T>(key: string, fallback?: T) =>
      (configuration.has(`${section}.${key}`) ? configuration.get(`${section}.${key}`) : fallback) as T,
    update: async (key: string, value: unknown) => {
      configuration.set(`${section}.${key}`, value);
    },
  }),
  onDidChangeConfiguration: event('workspace.configuration'),
  createFileSystemWatcher: () =>
    track('fileSystemWatcher', { onDidChange: event('watcher.change'), onDidCreate: event('watcher.create'), onDidDelete: event('watcher.delete') }),
  asRelativePath: (value: unknown) => String(value),
  fs: { readFile: async () => new Uint8Array() },
};

export const env = {
  appName: 'Visual Studio Code',
  clipboard: { readText: async () => '', writeText: async (_text: string) => undefined },
  openExternal: async () => true,
};

export const extensions = { all: [] as { packageJSON: unknown }[], getExtension: (_id: string) => undefined };

export const lm = {
  registerMcpServerDefinitionProvider: (id: string) => track(`mcpProvider:${id}`),
};

export class McpHttpServerDefinition {
  constructor(readonly label: string, readonly uri: Uri) {}
}
