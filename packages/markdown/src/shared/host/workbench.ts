import type { Disposer } from "@workshop/core";

/** VS Code commands: registering ours and running anyone's. */
export interface HostCommands {
  register(id: string, run: (...args: unknown[]) => unknown): Disposer;
  execute(id: string, ...args: unknown[]): Promise<unknown>;
}

export interface Clipboard {
  read(): Promise<string>;
  write(text: string): Promise<void>;
}

export interface PickItem<T> {
  label: string;
  description?: string;
  detail?: string;
  /** Rows with the same group sit under one separator, in the order given. */
  group?: string;
  value: T;
}

/** Messages and prompts. */
export interface Dialogs {
  error(message: string): void;
  inform(message: string): void;
  /** Ask with buttons; resolves to the chosen button, or undefined. */
  ask(message: string, actions: readonly string[]): Promise<string | undefined>;
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
  /** Reveal without taking focus; expansion commands can also preserve selection. */
  reveal(
    node: TreeNode,
    options?: { select?: boolean; focus?: boolean; expand?: boolean | number },
  ): Promise<void>;
  readonly visible: boolean;
  onVisibilityChanged(listener: (visible: boolean) => void): Disposer;
  dispose(): void;
}

export interface StatusHandle {
  show(text: string, tooltip?: string, command?: string): void;
  hide(): void;
  dispose(): void;
}

/** A webview panel that is not tied to a text document. */
export interface WorkshopPanel {
  reveal(): void;
  setTitle(title: string): void;
  readonly visible: boolean;
  onDidChangeVisibility(listener: (visible: boolean) => void): Disposer;
  onDispose(listener: () => void): Disposer;
  dispose(): void;
  readonly webview: {
    readonly cspSource: string;
    asset(relative: string): string;
    setHTML(html: string): void;
    post(message: unknown): void;
    onMessage(listener: (message: unknown) => void): Disposer;
  };
}

/** Native views: trees, status bar entries and standalone webview panels. */
export interface WorkbenchViews {
  tree(
    viewId: string,
    source: TreeSource,
    options?: { showCollapseAll?: boolean },
  ): TreeHandle;
  /**
   * A status bar entry. Priority is higher toward the outer edge of its side.
   * Defaults to the right; pass `{ alignment: "left" }` for a prominent left entry.
   */
  status(
    id: string,
    priority: number,
    options?: { alignment?: "left" | "right" },
  ): StatusHandle;
  /**
   * A document-independent webview panel. One panel per view type; a second
   * call reveals the existing one.
   */
  panel(viewType: string, title: string): WorkshopPanel;
}

/** Which note is in front, in this editor or a text editor. */
export interface ActiveEditor {
  /** The note in the active tab. */
  note(): string | undefined;
  onNoteChanged(listener: () => void): Disposer;
  /** The text and selection of a note open in a text editor. */
  textEditor(uri: string): { text: string; selection: string } | undefined;
  onTextSelectionChanged(listener: () => void): Disposer;
  /**
   * After Toggle Text Editor's `openWith`, close the leave-behind tab of the
   * other view for this URI in the active group (BH-011). Dirty tabs stay.
   * `keep` is the view that should remain: host text or Lumière.
   */
  closeSiblingTabs(uri: string, keep: "text" | "lumiere"): Promise<void>;
  /** The view type of the custom editor in the active tab, if one is there. */
  customEditorViewType(): string | undefined;
}
