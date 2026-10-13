import type { DiffViews, GitAccess } from "./git";
import type { Infer } from "../kernel";
import type { featureSettings } from "./features";
import type { Disposer } from "../kernel";
import type { Cancellation } from "./rpc/lifecycle";
import type { Endpoint, Transport } from "./rpc/endpoint";
import type { EditorProvider } from "./editor-provider";
import type { DiagnosticSink, WorkspaceFiles } from "./workspace-files";
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
  /** VS Code's view column; undefined while the panel is in no editor group. */
  readonly column: number | undefined;
  readonly id: string;
  readonly document: HostDocument;
  readonly rpc: Endpoint;
  active(): boolean;
  reveal(): void;
  /** Close the panel; resolves once its kernel and resources have stopped. */
  dispose(): Promise<void>;
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
  /** What Copy Link for Agent can reach: registered commands and VS Code's chat state. */
  agentEnvironment?(): Promise<AgentEnvironment>;
  /** Writes a scratch file outside the workspace (a passage to attach to an agent chat); returns its URI. */
  writeScratchFile?(name: string, text: string): Promise<string>;
  // Editors and settings.
  /** Register an editor (see `EditorProvider`); its panels go to `open`. */
  registerEditor(
    provider: EditorProvider,
    open: (panel: PanelShell) => void,
  ): Disposer;
  onConfiguration?(listener: () => void): Disposer;
  /** Reading and writing `markdownWorkbench.*` settings like the Settings UI. */
  settings?: SettingsAccess;
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
      /** The note's own body size in pixels and line height multiplier. */
      fontSize?: number;
      lineHeight?: number;
      /** VS Code's editor font settings as they apply to Markdown files. */
      fontFamily?: string;
      fontWeight?: string;
      letterSpacing?: number;
      fontLigatures?: boolean | string;
      fontVariations?: boolean | string;
      /** Native caret presentation settings, also resource-scoped to Markdown. */
      cursorStyle?:
        | "line"
        | "block"
        | "underline"
        | "line-thin"
        | "block-outline"
        | "underline-thin";
      cursorBlinking?: "blink" | "smooth" | "phase" | "expand" | "solid";
      cursorSmoothCaretAnimation?: "off" | "explicit" | "on";
      cursorWidth?: number;
    };
    preset: "minimal" | "obsidian";
    mode: "source" | "livePreview";
  };
  // Files, workspace and storage.
  watchFile?(uri: string, listener: () => void): Disposer;
  read(uri: string): Promise<Uint8Array>;
  stat(uri: string): Promise<{ mtime: number; symbolicLink: boolean }>;
  /** Create, copy and list workspace files. Plugins pass URIs; the host checks them. */
  files?: WorkspaceFiles;
  /** Problems panel entries, one owner at a time (a plugin id). */
  diagnostics?: DiagnosticSink;
  /** Show a file in a text editor beside the current one. Marp export needs this. */
  revealTextEditor?(uri: string): Promise<void>;
  /** Whether another extension, such as Marp or Agent PDF Viewer, is installed. */
  hasExtension?(id: string): boolean;
  workspaceFolders?(): readonly string[];
  isTrusted?(): boolean;
  storage?: {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
  };
  workerPath?(name: "search"): string;
  // Native navigation, views and prompts.
  navigation?: Navigation;
  registerNativeLinks?(): Disposer;
  views?: HostViews;
  // Git, through VS Code's git extension.
  git?: GitAccess;
  diffViews?: DiffViews;
}
declare module "../kernel/types" {
  interface Services {
    rpc: Endpoint;
    workbench: Workbench;
  }
}
/** One editor panel as the VS Code adapter hands it to the editor host. */
export interface PanelShell {
  /** VS Code's view column; undefined while the panel is in no editor group. */
  readonly column: number | undefined;
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
export interface RevealPanel {
  readonly id: string;
  readonly uri: string;
  active(): boolean;
  reveal(
    target: NavigationTarget & { requestId: number },
    token: Cancellation,
  ): Promise<boolean>;
}
export interface NavigationIntent {
  column?: number;
  requestId: number;
  token: Cancellation & { cancel(): void };
}
export interface Navigation {
  begin?(): NavigationIntent;
  registerReveal(panel: RevealPanel): Disposer;
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
    intent?: NavigationIntent;
  }): Promise<string | undefined>;
  open(
    root: string,
    uri: string,
    fragment: string,
    side: boolean,
    at?: number,
    intent?: NavigationIntent,
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
  /** Text shown above the tree, such as "No note is open"; undefined removes it. */
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
  /** Rows with the same group sit under one separator, in the order given. */
  group?: string;
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
/** Where a setting is stored: the folder, the workspace or the user's settings. */
export type SettingTarget = "workspaceFolder" | "workspace" | "user";

/** One setting of the extension's `contributes.configuration`, as VS Code lists it. */
export interface ContributedSetting {
  /** The full key, such as `markdownWorkbench.editor.fontSize`. */
  key: string;
  schema: {
    type?: string | readonly string[];
    enum?: readonly unknown[];
    enumDescriptions?: readonly string[];
    minimum?: number;
    maximum?: number;
    default?: unknown;
    description?: string;
    markdownDescription?: string;
  };
}

/** The Settings UI's own keys and scopes, for commands that change settings. */
export interface SettingsAccess {
  /** A `markdownWorkbench.` key as it is now, and where a write to it goes. */
  inspect(
    key: string,
    resource?: string,
  ): { value: unknown; target: SettingTarget };
  /** Writes the key where `inspect` says (the workspace if it sets it, else the user's settings). */
  update(
    key: string,
    value: unknown,
    resource?: string,
  ): Promise<SettingTarget>;
  /** The extension's contributed settings, straight from its package.json. */
  contributed(): readonly ContributedSetting[];
  /** Opens the Settings UI with a search such as `@ext:publisher.name`. */
  openUi(query: string): Promise<void>;
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
  /** A text prompt with the text preselected; undefined when dismissed. */
  input(options: {
    prompt: string;
    value: string;
    validate(value: string): string | undefined;
  }): Promise<string | undefined>;
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
/** The `markdownWorkbench.copyLinkForAgent.target` setting. */
export type CopyLinkTarget =
  "auto" | "cursor" | "chat" | "claudeCode" | "codex" | "clipboard";

/** What the editor offers Copy Link for Agent. */
export interface AgentEnvironment {
  /** Where Copy Link for Agent sends the passage: `auto` or one agent. */
  target: CopyLinkTarget;
  /** Installed agent extensions (Claude Code, Codex), active or not. */
  agentExtensions: ReadonlySet<string>;
  /** Every registered command. */
  commands: ReadonlySet<string>;
  /** Whether an installed extension (e.g. Copilot Chat) answers in VS Code's chat. */
  hasChatParticipant: boolean;
  /** VS Code's `chat.disableAIFeatures`: the chat is hidden. */
  chatDisabled: boolean;
}
