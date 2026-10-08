import type { Infer } from "../kernel";
import type { featureSettings } from "./features";
import type { Disposer } from "../kernel";
import type { Endpoint, Transport } from "./rpc/endpoint";
export interface HostDocument {
  readonly id: string;
  readonly uri: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly isUntitled: boolean;
  readonly eol: "\n" | "\r\n";
  getText(): string;
  save(): Promise<boolean>;
}
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}
export interface PanelPort {
  readonly column?: number;
  readonly id: string;
  readonly document: HostDocument;
  readonly rpc: Endpoint;
  active(): boolean;
  reveal(): void;
  dispose(): void;
}
export interface Workbench {
  fingerprint(text: string): string;
  apply(document: HostDocument, edits: readonly TextEdit[]): Promise<boolean>;
  onChange(
    listener: (document: HostDocument, changes?: readonly SourceEdit[]) => void,
  ): Disposer;
  onSave(listener: (document: HostDocument) => void): Disposer;
  onWillSave(listener: (document: HostDocument) => Promise<void>): Disposer;
  command(id: string, run: () => unknown): Disposer;
  execute(id: string, ...args: unknown[]): Promise<unknown>;
  clipboard: { read(): Promise<string>; write(text: string): Promise<void> };
  error(message: string): void;
}
declare module "../kernel/types" {
  interface Services {
    rpc: Endpoint;
    workbench: Workbench;
  }
}
export interface PanelShell {
  readonly column?: number;
  readonly id: string;
  readonly document: HostDocument;
  readonly transport: Transport;
  readonly cspSource: string;
  readonly trusted: boolean;
  active(): boolean;
  reveal(): void;
  dispose(): void;
  setHTML(html: string): void;
  asset(relative: string): string;
  onDispose(listener: () => void): Disposer;
  onState(listener: () => void): Disposer;
}
export interface Workbench {
  registerEditor(open: (panel: PanelShell) => void): Disposer;
  onConfiguration?(listener: () => void): Disposer;
  config(document: HostDocument): {
    features?: Infer<typeof featureSettings>;
    editor?: { useTabs: boolean; tabSize: number };
    preset: "minimal" | "obsidian";
    mode: "source" | "livePreview";
  };
}
export interface Workbench {
  read(uri: string): Promise<Uint8Array>;
  stat(uri: string): Promise<{ mtime: number; symbolicLink: boolean }>;
}
export interface PanelShell {
  resource(uri: string): string;
}

export interface NavigationTarget {
  fragment: string;
  at?: number;
}
export interface Navigation {
  takeReveal(uri: string): NavigationTarget;
  onReveal(listener: (uri: string, target: NavigationTarget) => void): Disposer;
  readonly scheme: string;
  external(href: string): Promise<boolean>;
  confirm(message: string): Promise<boolean>;
  resolve(request: {
    root: string;
    source: string;
    path: string;
    create: boolean;
    folderNote: string;
  }): Promise<string | undefined>;
  open(
    root: string,
    uri: string,
    fragment: string,
    side: boolean,
    at?: number,
  ): Promise<void>;
}
export interface Workbench {
  navigation?: Navigation;
  openDocument?(uri: string): Promise<HostDocument>;
}

export interface Workbench {
  storage?: {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
  };
}

/** A node in a native tree view, free of VS Code types. */
export interface TreeNode {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  /** A codicon name, such as `file` or `link`. */
  icon?: string;
  /** Shows the file's icon and allows dragging the file. */
  resourceUri?: string;
  /** Undefined for a leaf; otherwise whether it starts expanded. */
  expanded?: boolean;
  /** Runs when the node is clicked. */
  command?: { id: string; args?: unknown[] };
}
export interface TreeSource {
  roots(): TreeNode[] | Promise<TreeNode[]>;
  children(node: TreeNode): TreeNode[] | Promise<TreeNode[]>;
  /** Needed to reveal a node below the roots. */
  parent?(node: TreeNode): TreeNode | undefined;
}
export interface TreeHandle {
  refresh(): void;
  /** Text shown above the tree, such as "No note is open". */
  setMessage(message: string | undefined): void;
  reveal(node: TreeNode): void;
  readonly visible: boolean;
  onVisibilityChanged(listener: (visible: boolean) => void): Disposer;
  dispose(): void;
}
export interface StatusHandle {
  show(text: string, tooltip?: string, command?: string): void;
  hide(): void;
  dispose(): void;
}
export interface PickItem<T> {
  label: string;
  description?: string;
  detail?: string;
  value: T;
}
/** Text edits for one file, by line and column (UTF-16 code units). */
export interface FileTextEdits {
  uri: string;
  edits: {
    start: { line: number; col: number };
    end: { line: number; col: number };
    text: string;
  }[];
}
/** Native views, status bar and prompts for host plugins (DESIGN §7.1). */
export interface HostViews {
  tree(viewId: string, source: TreeSource): TreeHandle;
  status(id: string, priority: number): StatusHandle;
  /** A quick pick whose items are recomputed as the user types. */
  pick<T>(options: {
    placeholder: string;
    items(query: string): readonly PickItem<T>[];
  }): Promise<{ item?: PickItem<T>; query: string } | undefined>;
  /** Ask with buttons; resolves to the chosen button, or undefined. */
  ask(message: string, actions: readonly string[]): Promise<string | undefined>;
  command(id: string, run: (...args: unknown[]) => unknown): Disposer;
  /** The note in the active tab, in this editor or the text editor. */
  activeNote(): string | undefined;
  onActiveNoteChanged(listener: () => void): Disposer;
  /** The text and selection of a note open in a text editor. */
  textEditor(uri: string): { text: string; selection: string } | undefined;
  onTextSelectionChanged(listener: () => void): Disposer;
  /** The current text of an open document, saved or not. */
  documentText(uri: string): string | undefined;
  /** A window-level setting under `markdownWorkbench.`. */
  setting<T>(key: string, fallback: T): T;
  /** Before files are renamed in VS Code; the edits apply with the rename. */
  onWillRename(
    listener: (
      renames: readonly { oldUri: string; newUri: string }[],
    ) => Promise<readonly FileTextEdits[]>,
  ): Disposer;
}
export interface Workbench {
  views?: HostViews;
}

export interface Workbench {
  renameFile?(document: HostDocument, target: string): Promise<void>;
}

export interface Workbench {
  workerPath?(name: "search"): string;
}

export interface Workbench {
  workspaceFolders?(): readonly string[];
}

/** Original-source offsets from a native document change, including CR characters. */
export interface SourceEdit {
  from: number;
  to: number;
  insert: string;
}
