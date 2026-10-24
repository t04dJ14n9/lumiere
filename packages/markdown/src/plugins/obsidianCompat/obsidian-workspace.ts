import type { EditorView } from "@codemirror/view";
import { createChildEl, createDiv, getDomDocument } from "./dom-helpers";
import { Editor } from "./editor-bridge";
import {
  App,
  AppCommands,
  MarkdownPreviewRenderer,
  MarkdownRenderer,
  type MarkdownRendererBackend,
  type ObsidianCommand,
  type UserEvent,
} from "./obsidian-app";
import type { MarkdownRenderChild } from "./obsidian-core";
import { Component, Events, normalizePath } from "./obsidian-core";
import type { TFile } from "./obsidian-files";

export {
  App,
  AppCommands,
  MarkdownPreviewRenderer,
  MarkdownRenderer,
  type MarkdownRendererBackend,
  type ObsidianCommand,
  type UserEvent,
};

export interface ViewState {
  type: string;
  state?: Record<string, unknown>;
  active?: boolean;
  pinned?: boolean;
}

export class WorkspaceItem extends Events {
  getRoot(): WorkspaceItem {
    return this;
  }
}

export class WorkspaceParent extends WorkspaceItem {}
export class WorkspaceSplit extends WorkspaceParent {}
export class WorkspaceTabs extends WorkspaceParent {}
export class WorkspaceSidedock extends WorkspaceSplit {
  collapsed = false;
  toggle(): void {
    this.collapsed = !this.collapsed;
  }
  expand(): void {
    this.collapsed = false;
  }
  collapse(): void {
    this.collapsed = true;
  }
}
export class WorkspaceRibbon {}

export class WorkspaceLeaf extends WorkspaceItem {
  app: App;
  view: View;
  containerEl: HTMLElement;

  constructor(app: App, view?: View) {
    super();
    this.app = app;
    this.containerEl = createDiv("workspace-leaf");
    this.view = view ?? new View(this);
  }

  getViewState(): ViewState {
    return {
      type: this.view.getViewType(),
      state: this.view.getState(),
    };
  }

  async setViewState(viewState: ViewState, eState?: unknown): Promise<void> {
    await this.view.setState(viewState.state ?? {}, { history: false });
    if (eState !== undefined) {
      this.view.setEphemeralState(eState);
    }
  }

  async openFile(file: TFile, openState?: ViewState): Promise<void> {
    if (this.view instanceof FileView) {
      await this.view.onLoadFile(file);
    }
    if (openState) {
      await this.setViewState(openState);
    }
  }

  async open(view: View): Promise<View> {
    this.view = view;
    return view;
  }

  rebuildView(): void {}

  detach(): void {
    this.containerEl.remove();
  }
}

export class View extends Component {
  app: App;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;
  icon = "document";
  navigation = false;

  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = createChildEl(leaf.containerEl, "div", "view-content");
  }

  protected async onOpen(): Promise<void> {}
  protected async onClose(): Promise<void> {}

  getViewType(): string {
    return "empty";
  }

  getDisplayText(): string {
    return "";
  }

  getIcon(): string {
    return this.icon;
  }

  getState(): Record<string, unknown> {
    return {};
  }

  async setState(
    _state: unknown,
    _result: { history: boolean },
  ): Promise<void> {}

  getEphemeralState(): Record<string, unknown> {
    return {};
  }

  setEphemeralState(_state: unknown): void {}
}

export class ItemView extends View {
  contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl = createChildEl(
      this.containerEl,
      "div",
      "item-view-content",
    );
  }

  addAction(
    icon: string,
    title: string,
    callback: (evt: MouseEvent) => unknown,
  ): HTMLElement {
    const actionEl = createChildEl(this.containerEl, "div", {
      cls: "clickable-icon view-action",
      attr: { "aria-label": title, "data-icon": icon },
    });
    actionEl.addEventListener("click", (evt) => {
      void callback(evt);
    });
    return actionEl;
  }
}

export class FileView extends ItemView {
  allowNoFile = true;
  file: TFile | null = null;

  override getDisplayText(): string {
    return this.file?.basename ?? "";
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.file = file;
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    this.file = null;
  }

  canAcceptExtension(_extension: string): boolean {
    return true;
  }
}

export class EditableFileView extends FileView {}

export abstract class TextFileView extends EditableFileView {
  data = "";

  abstract getViewData(): string;
  abstract setViewData(data: string, clear: boolean): void;
  abstract clear(): void;

  async save(_clear = false): Promise<void> {
    if (this.file) {
      await this.app.vault.modify(this.file, this.getViewData());
    }
  }
}

export class MarkdownPreviewView extends Component implements MarkdownSubView {
  containerEl: HTMLElement;
  private text = "";

  constructor(containerEl?: HTMLElement) {
    super();
    this.containerEl = containerEl ?? createDiv("markdown-preview-view");
  }

  get(): string {
    return this.text;
  }

  set(data: string, _clear: boolean): void {
    this.text = data;
  }

  clear(): void {
    this.text = "";
    this.containerEl.textContent = "";
  }

  rerender(_full = false): void {}

  getScroll(): number {
    return this.containerEl.scrollTop;
  }

  applyScroll(scroll: number): void {
    this.containerEl.scrollTop = scroll;
  }
}

export interface MarkdownSubView {
  get(): string;
  set(data: string, clear: boolean): void;
}

export interface MarkdownFileInfo {
  app: App;
  editor?: Editor | undefined;
  file: TFile | null;
}

export class MarkdownView extends TextFileView implements MarkdownFileInfo {
  editor: Editor;
  previewMode: MarkdownPreviewView;
  currentMode: MarkdownSubView;

  constructor(
    leaf: WorkspaceLeaf,
    getEditorView: () => EditorView,
    file: TFile | null = null,
  ) {
    super(leaf);
    this.file = file;
    this.editor = new Editor(getEditorView);
    this.previewMode = new MarkdownPreviewView(this.contentEl);
    this.currentMode = {
      get: () => this.getViewData(),
      set: (value: string, clear: boolean) => this.setViewData(value, clear),
    };
  }

  override getViewType(): string {
    return "markdown";
  }

  getMode(): "source" | "preview" {
    return "source";
  }

  override getViewData(): string {
    return this.editor.getValue();
  }

  override setViewData(data: string, _clear = false): void {
    this.editor.setValue(data);
    this.data = data;
  }

  override clear(): void {
    this.editor.setValue("");
    this.data = "";
  }

  showSearch(_replace = false): void {}
}

export interface MarkdownSectionInformation {
  text: string;
  lineStart: number;
  lineEnd: number;
}

export interface MarkdownPostProcessorContext {
  docId: string;
  sourcePath: string;
  frontmatter: Record<string, unknown> | null | undefined;
  addChild(child: Component | MarkdownRenderChild): void;
  getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null;
}

export type MarkdownPostProcessor = {
  (el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<unknown> | void;
  sortOrder?: number;
};

export interface WorkspaceBackend {
  getEditorView?(): EditorView | null;
  openLinkText?(
    linktext: string,
    sourcePath: string,
    newLeaf?: boolean | string,
  ): Promise<void>;
}

export class Workspace extends Events {
  leftSplit: WorkspaceSidedock = new WorkspaceSidedock();
  rightSplit: WorkspaceSidedock = new WorkspaceSidedock();
  rootSplit: WorkspaceSplit = new WorkspaceSplit();
  leftRibbon: WorkspaceRibbon = new WorkspaceRibbon();
  rightRibbon: WorkspaceRibbon = new WorkspaceRibbon();
  containerEl: HTMLElement;
  layoutReady = true;
  activeLeaf: WorkspaceLeaf | null;
  activeEditor: MarkdownFileInfo | null;
  private readonly markdownView: MarkdownView;
  private readonly viewFactories = new Map<
    string,
    (leaf: WorkspaceLeaf) => View
  >();
  private backend: WorkspaceBackend;

  constructor(
    private readonly app: App,
    backend: WorkspaceBackend = {},
  ) {
    super();
    this.backend = backend;
    this.containerEl = getDomDocument().body ?? createDiv("workspace");
    const leaf = new WorkspaceLeaf(app);
    this.markdownView = new MarkdownView(
      leaf,
      () => this.backend.getEditorView?.() as EditorView,
    );
    leaf.view = this.markdownView;
    this.activeLeaf = leaf;
    this.activeEditor = this.markdownView;
  }

  setBackend(backend: WorkspaceBackend): void {
    this.backend = backend;
  }

  registerViewFactory(
    type: string,
    factory: (leaf: WorkspaceLeaf) => View,
  ): () => void {
    this.viewFactories.set(type, factory);
    return () => {
      this.viewFactories.delete(type);
    };
  }

  setActiveFile(file: TFile | null): void {
    const prev = this.markdownView.file;
    this.markdownView.file = file;
    if (prev?.path !== file?.path) {
      this.trigger("file-open", file);
      this.trigger("active-leaf-change", this.activeLeaf);
    }
  }

  notifyEditorChange(): void {
    this.trigger("editor-change", this.markdownView.editor, this.markdownView);
  }

  onLayoutReady(callback: () => unknown): void {
    if (this.layoutReady) {
      void callback();
    } else {
      this.on("layout-ready", callback);
    }
  }

  getActiveViewOfType<T extends View>(
    type: abstract new (...args: never[]) => T,
  ): T | null {
    if (this.markdownView instanceof type) {
      return this.markdownView;
    }
    return null;
  }

  getActiveFile(): TFile | null {
    return this.markdownView.file;
  }

  getLeaf(_newLeaf?: boolean | string): WorkspaceLeaf {
    return this.activeLeaf ?? new WorkspaceLeaf(this.app, this.markdownView);
  }

  getMostRecentLeaf(): WorkspaceLeaf | null {
    return this.activeLeaf;
  }

  getLeavesOfType(viewType: string): WorkspaceLeaf[] {
    if ((viewType === "markdown" || viewType === "") && this.activeLeaf) {
      return [this.activeLeaf];
    }
    return [];
  }

  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void {
    if (this.activeLeaf) {
      callback(this.activeLeaf);
    }
  }

  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void {
    if (this.activeLeaf) {
      callback(this.activeLeaf);
    }
  }

  iterateCodeMirrors(_callback: (cm: unknown) => unknown): void {}

  revealLeaf(_leaf: WorkspaceLeaf): Promise<void> {
    return Promise.resolve();
  }

  async openLinkText(
    linktext: string,
    sourcePath: string,
    newLeaf?: boolean | string,
    _openViewState?: ViewState,
  ): Promise<void> {
    const dest = this.app.metadataCache.getFirstLinkpathDest(
      linktext,
      sourcePath,
    );
    if (dest) {
      this.setActiveFile(dest);
    }
    if (this.backend.openLinkText) {
      await this.backend.openLinkText(
        linktext,
        normalizePath(sourcePath),
        newLeaf,
      );
    }
  }

  updateOptions(): void {
    this.trigger("css-change");
  }
}
