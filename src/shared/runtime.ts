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
/**
 * The VS Code adapter (DESIGN §7.1): every host capability plugins use, as
 * plain functions that return disposers, so plugins run against a fake in
 * unit tests. Optional members are absent in fakes and minimal hosts.
 */
export interface Workbench {
  // Documents and saving.
  fingerprint(text: string): string;
  apply(document: HostDocument, edits: readonly TextEdit[]): Promise<boolean>;
  onChange(
    listener: (document: HostDocument, changes?: readonly SourceEdit[]) => void,
  ): Disposer;
  onSave(listener: (document: HostDocument) => void): Disposer;
  onWillSave(listener: (document: HostDocument) => Promise<void>): Disposer;
  openDocument?(uri: string): Promise<HostDocument>;
  renameFile?(document: HostDocument, target: string): Promise<void>;
  // Commands, clipboard and messages.
  command(id: string, run: () => unknown): Disposer;
  execute(id: string, ...args: unknown[]): Promise<unknown>;
  clipboard: { read(): Promise<string>; write(text: string): Promise<void> };
  error(message: string): void;
  inform?(message: string): void;
  /** What Ask Agent can reach: registered commands and VS Code's chat state. */
  agentEnvironment?(): Promise<AgentEnvironment>;
  /** Writes a scratch file outside the workspace (a passage to attach to an agent chat); returns its URI. */
  writeScratchFile?(name: string, text: string): Promise<string>;
  // Editors and settings.
  registerEditor(open: (panel: PanelShell) => void): Disposer;
  onConfiguration?(listener: () => void): Disposer;
  /**
   * The workspace's own `workbench.editorAssociations`, not the user's or a
   * folder's. `read()` is undefined when no workspace is open.
   */
  editorAssociations?: {
    read(): unknown;
    write(associations: Readonly<Record<string, string>>): Promise<void>;
  };
  config(document: HostDocument): {
    debugLogging?: boolean;
    features?: Infer<typeof featureSettings>;
    editor?: {
      useTabs: boolean;
      tabSize: number;
      readableLineLength?: boolean;
      strictLineBreaks?: boolean;
      rightToLeft?: boolean;
      defaultMode?: "livePreview" | "source";
    };
    preset: "minimal" | "obsidian";
    mode: "source" | "livePreview";
  };
  // Files, workspace and storage.
  read(uri: string): Promise<Uint8Array>;
  stat(uri: string): Promise<{ mtime: number; symbolicLink: boolean }>;
  workspaceFolders?(): readonly string[];
  isTrusted?(): boolean;
  storage?: {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
  };
  workerPath?(name: "search"): string;
  // Native navigation, views and prompts.
  navigation?: Navigation;
  views?: HostViews;
}
declare module "../kernel/types" {
  interface Services {
    rpc: Endpoint;
    workbench: Workbench;
  }
}
/** One editor panel as the VS Code adapter hands it to the editor host. */
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
  resource(uri: string): string;
  onDispose(listener: () => void): Disposer;
  onState(listener: () => void): Disposer;
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
    newNoteFolder?: string;
  }): Promise<string | undefined>;
  open(
    root: string,
    uri: string,
    fragment: string,
    side: boolean,
    at?: number,
  ): Promise<void>;
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
/** Original-source offsets from a native document change, including CR characters. */
export interface SourceEdit {
  from: number;
  to: number;
  insert: string;
}
/** What the editor offers Ask Agent about Selection. */
export interface AgentEnvironment {
  /** Every registered command. */
  commands: ReadonlySet<string>;
  /** Whether an installed extension (e.g. Copilot Chat) answers in VS Code's chat. */
  hasChatParticipant: boolean;
  /** VS Code's `chat.disableAIFeatures`: the chat is hidden. */
  chatDisabled: boolean;
}
