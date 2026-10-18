import * as vscode from "vscode";
import type { Digests } from "@workshop/platform";
import {
  isCurrentPatch,
  parseViewerMessage,
  type HostMessage,
  type OutlineItem,
  type ViewerMessage,
  type ViewerPatch,
} from "../../../shared/messages";
import type { PdfLocation } from "../../../shared/pdf-location";
import type { HistorySnapshot } from "../../../shared/pdf-history";
import type { PdfSelection } from "../../../shared/selection";
import type { ToolbarSettings } from "../../../shared/toolbar-settings";
import type { ViewerAction, ViewState } from "../../../shared/view-state";
import {
  positionFromView,
  type ReadingPosition,
} from "../../../shared/reading-position";
import type { ViewSettings } from "../../../shared/view-settings";
import { PdfNavigation } from "./navigation";
import { PdfSelectionState, type SelectionSnapshot } from "./selection";
import { PdfSource } from "./source";
import { createPdfViewId } from "./view-id";
import { viewerHtml } from "./webview-html";
import { HistoryRequests } from "./history-requests";

/** Messages the panel leaves to plugins (see `PdfPanels.handle`). */
export type PluginMessage = Extract<
  ViewerMessage,
  {
    type:
      | "copyLinkForAgent"
      | "toggleOutline"
      | "floatingDock"
      | "lookUp"
      | "zen"
      | "historyJump"
      | "historyTraverse";
  }
>;

export interface PanelOptions {
  extensionUri: vscode.Uri;
  /** Hashes the PDF's bytes, which tie a selection to the file it was made in. */
  digests: Digests;
  /** The toolbar layout for the first paint. */
  toolbar: ToolbarSettings;
  settings: ViewSettings;
  position: ReadingPosition | undefined;
  savePosition(position: ReadingPosition): void;
  /** Hand a message the panel does not handle itself to the plugin that does. */
  route(panel: PdfPanel, message: PluginMessage): Promise<void>;
}

/**
 * One open PDF editor: the webview and the state the viewer reports. It owns
 * three parts, each with its own invariant:
 *
 *   source      the file's bytes and hash, reloaded when the file changes
 *   selection   the selection, always belonging to the loaded bytes
 *   navigation  locations and actions, held until the viewer has the PDF
 *
 * Everything else (Copy Link for Agent, the outline view, the toolbar's
 * floating bar) belongs to plugins, which receive their messages through
 * `PanelOptions.route`.
 */
export class PdfPanel implements vscode.Disposable {
  /**
   * Temporary id of this pane. Not the file path and not a `#page=` locator:
   * two panes can show the same PDF, and the id dies with this pane.
   */
  readonly viewId = createPdfViewId();
  /** The outline, or `undefined` while the viewer is still reading it. */
  outline: OutlineItem[] | undefined;
  /** Page and zoom as the viewer last reported them; `undefined` until it has the PDF. */
  view: ViewState | undefined;

  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the outline, the selection or the view changes. */
  readonly onDidChange = this.changed.event;
  private readonly selected = new vscode.EventEmitter<
    SelectionSnapshot | undefined
  >();
  /** Fires with each new selection (or none), after `onDidChange`. */
  readonly onDidChangeSelection = this.selected.event;

  private readonly source: PdfSource;
  private readonly selectionState = new PdfSelectionState();
  private readonly navigation: PdfNavigation;
  private readonly disposables: vscode.Disposable[] = [];
  private lookUp = false;
  private zen = false;
  /** The number of the last `load` sent, and the last patch version applied. */
  private loads = 0;
  private patchVersion = 0;
  private loading = false;
  private position: ReadingPosition | undefined;
  private settings: ViewSettings;
  private toolbar: ToolbarSettings;
  private lastJump = 0;
  private readonly history = new HistoryRequests((message) =>
    this.post(message),
  );
  private historyState = { back: false, forward: false };

  constructor(
    readonly uri: vscode.Uri,
    readonly webviewPanel: vscode.WebviewPanel,
    private readonly options: PanelOptions,
  ) {
    this.position = options.position;
    this.settings = options.settings;
    this.toolbar = { ...options.toolbar };
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(options.extensionUri, "dist", "pdf", "webview"),
      ],
    };
    this.navigation = new PdfNavigation((message) => this.post(message));
    this.source = new PdfSource(uri, () => void this.load(), options.digests);
    this.disposables.push(
      this.changed,
      this.selected,
      this.source,
      webview.onDidReceiveMessage((message) => this.receive(message)),
    );
    webview.html = viewerHtml(webview, options.extensionUri, options.toolbar);
  }

  get selection(): PdfSelection | undefined {
    return this.selectionState.selection;
  }

  /** The selection with the hash of the bytes it was made in (and a region's image). */
  selectionSnapshot(): SelectionSnapshot | undefined {
    return this.selectionState.snapshot();
  }

  /** Show a page (and box), or with no box the page from `top` points below its top. */
  goTo(location: PdfLocation, top?: number): number {
    const requestId = this.history.nextId();
    this.navigation.goTo(location, top, requestId);
    return requestId;
  }

  /** Native precise links share the validated, load-scoped restoration acknowledgement. */
  revealLocation(
    location: PdfLocation,
    expectedIntent: number,
  ): { requestId: number; done: Promise<boolean> } {
    const requestId = this.history.latest + 1;
    const done = this.history
      .request("historyRestored", undefined, expectedIntent, location)
      .then(Boolean);
    return { requestId, done };
  }

  cancelNavigation(requestId: number): void {
    if (requestId !== this.history.latest) {
      return;
    }
    this.navigation.cancel();
    this.cancelHistoryRestore();
  }

  setHistoryState(back: boolean, forward: boolean): void {
    if (
      back === this.historyState.back &&
      forward === this.historyState.forward
    ) {
      return;
    }
    this.historyState = { back, forward };
    this.post({ type: "historyState", back, forward });
  }

  cancelHistoryRestore(): void {
    this.post({ type: "historyCancel" });
    this.history.cancelAll();
  }

  /** Flush a pending deliberate jump and read the viewport before leaving it. */
  capturePosition(): Promise<HistorySnapshot | undefined> {
    return this.prepareLocation()?.done ?? Promise.resolve(undefined);
  }

  prepareLocation():
    | { requestId: number; done: Promise<HistorySnapshot | undefined> }
    | undefined {
    if (this.loading || !this.view) {
      return undefined;
    }
    const requestId = this.history.latest + 1;
    return { requestId, done: this.history.request("historyCaptured") };
  }

  /** A restore succeeds only when the current webview acknowledges it. */
  async restoreHistory(
    position: ReadingPosition,
    expectedIntent: number,
  ): Promise<ReadingPosition | undefined> {
    if (this.loading || !this.view) {
      return undefined;
    }
    return (
      await this.history.request("historyRestored", position, expectedIntent)
    )?.position;
  }

  /** Ask the viewer to page, zoom or find; ignored until it has the PDF. */
  act(action: ViewerAction): void {
    this.navigation.act(action);
    // A status bar entry, title button or picker leaves the keyboard focus
    // outside the viewer, where the arrow keys would do nothing: give it back.
    // Find puts the focus in its own box.
    if (action.action !== "find") {
      void vscode.commands
        .executeCommand("workbench.action.focusActiveEditorGroup")
        .then(undefined, () => undefined);
    }
  }

  /** Show the viewer's controls where the changed setting says. */
  setToolbar(toolbar: ToolbarSettings): void {
    this.toolbar = { ...toolbar };
    this.post({ type: "toolbar", toolbar: this.toolbar });
  }

  /** Turn macOS Look Up on or off in the viewer (it is off until the plugin says). */
  requestLookUp(): void {
    if (this.lookUp && !this.loading) {
      this.post({ type: "lookUpRequest" });
    }
  }

  setLookUp(enabled: boolean): void {
    this.lookUp = enabled;
    this.post({ type: "lookUp", enabled });
  }

  /** Zen mode is on or off: the viewer shows a floating bar for as long as it lasts. */
  setZen(on: boolean): void {
    this.zen = on;
    this.post({ type: "zen", on });
  }

  setViewSettings(settings: ViewSettings): void {
    this.settings = settings;
    this.post({ type: "viewSettings", settings });
  }

  dispose(): void {
    this.history.cancelAll();
    if (this.position) {
      this.options.savePosition(this.position);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async receive(raw: unknown): Promise<void> {
    const message = parseViewerMessage(raw);
    if (!message) {
      return;
    }
    await this.apply(message);
  }

  private async apply(message: ViewerMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.onReady();
        break;
      case "patch":
        this.onPatch(message);
        break;
      case "openExternal":
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
      case "error":
        void vscode.window.showErrorMessage(`PDF viewer: ${message.message}`);
        break;
      case "historyCaptured":
      case "historyRestored":
        this.onHistoryReport(message);
        break;
      case "historyJump":
        await this.onHistoryJump(message);
        break;
      case "historyTraverse":
        if (this.isCurrentLoad(message.load)) {
          await this.options.route(this, message);
        }
        break;
      default:
        await this.options.route(this, message);
    }
  }

  /** A new viewer page: its patch versions start again (load numbers do not). */
  private async onReady(): Promise<void> {
    this.history.newViewer();
    this.patchVersion = 0;
    this.lastJump = 0;
    await this.load();
  }

  /** Stale (an older version) or about the previous bytes: see shared/messages.ts. */
  private onPatch(message: Extract<ViewerMessage, { type: "patch" }>): void {
    if (
      this.loading ||
      !isCurrentPatch(message, this.patchVersion, this.loads)
    ) {
      return;
    }
    this.patchVersion = message.version;
    this.applyPatch(message.patch);
  }

  /** Whether a message is about the bytes the viewer shows now. */
  private isCurrentLoad(load: number): boolean {
    return !this.loading && load === this.loads;
  }

  private onHistoryReport(
    message: Extract<
      ViewerMessage,
      { type: "historyCaptured" | "historyRestored" }
    >,
  ): void {
    if (this.isCurrentLoad(message.load)) {
      this.history.answer(message);
    }
  }

  private async onHistoryJump(
    message: Extract<ViewerMessage, { type: "historyJump" }>,
  ): Promise<void> {
    if (!this.isCurrentLoad(message.load) || message.id <= this.lastJump) {
      return;
    }
    this.lastJump = message.id;
    await this.options.route(this, message);
  }

  private applyPatch({ outline, selection, view }: ViewerPatch): void {
    if (outline) {
      this.outline = outline;
    }
    if (view) {
      this.view = view;
      this.position = positionFromView(view);
    }
    if (selection) {
      this.selectionState.set(
        selection.selection ?? undefined,
        this.source.sha256,
        selection.image,
      );
    }
    this.changed.fire();
    if (selection) {
      this.selected.fire(this.selectionState.snapshot());
    }
  }

  /** Send the file to the viewer, which (re)opens it. */
  private async load(): Promise<void> {
    this.loading = true;
    this.history.cancelAll();
    this.lastJump = 0;
    this.navigation.unload();
    this.outline = undefined;
    this.view = undefined;
    // Cleared before the new bytes go out: see PdfSelectionState.
    this.selectionState.clear();
    this.changed.fire();
    const bytes = await this.source.read();
    if (!bytes) {
      return;
    }
    this.loads++;
    this.post({
      type: "load",
      load: this.loads,
      data: bytes.data,
      settings: this.settings,
      ...(this.position ? { position: this.position } : {}),
    });
    this.history.newViewer();
    this.loading = false;
    this.navigation.loadedNow();
    // A rebuilt webview starts from the original HTML attributes. Rehydrate
    // changes made since the panel opened, after load retires its old inbox.
    this.post({ type: "toolbar", toolbar: this.toolbar });
    this.post({ type: "historyState", ...this.historyState });
    if (this.lookUp) {
      this.post({ type: "lookUp", enabled: true });
    }
    if (this.zen) {
      this.post({ type: "zen", on: true });
    }
  }

  private post(message: HostMessage): void {
    void this.webviewPanel.webview.postMessage(message);
  }
}
