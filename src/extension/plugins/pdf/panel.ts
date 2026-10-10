import * as vscode from "vscode";
import {
  isCurrentPatch,
  parseViewerMessage,
  type HostMessage,
  type OutlineItem,
  type ViewerMessage,
  type ViewerPatch,
} from "../../../shared/messages";
import type { PdfLocation } from "../../../shared/pdf-location";
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
import { viewerHtml } from "./webview-html";

/** Messages the panel leaves to plugins (see `PdfPanels.handle`). */
export type PluginMessage = Extract<
  ViewerMessage,
  { type: "copyLinkForAgent" | "toggleOutline" | "floatingDock" | "lookUp" }
>;

export interface PanelOptions {
  extensionUri: vscode.Uri;
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
  /** `load` messages sent to the current viewer page, and the last patch applied from it. */
  private lookUp = false;
  private loads = 0;
  private patchVersion = 0;
  private position: ReadingPosition | undefined;
  private settings: ViewSettings;

  constructor(
    readonly uri: vscode.Uri,
    readonly webviewPanel: vscode.WebviewPanel,
    private readonly options: PanelOptions,
  ) {
    this.position = options.position;
    this.settings = options.settings;
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(options.extensionUri, "dist", "webview"),
      ],
    };
    this.navigation = new PdfNavigation((message) => this.post(message));
    this.source = new PdfSource(uri, () => void this.load());
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
  goTo(location: PdfLocation, top?: number): void {
    this.navigation.goTo(location, top);
  }

  /** Ask the viewer to page, zoom or find; ignored until it has the PDF. */
  act(action: ViewerAction): void {
    this.navigation.act(action);
    // A status bar entry, title button or picker leaves the keyboard focus
    // outside the viewer, where the arrow keys would do nothing: give it back.
    // Find puts the focus in its own box.
    if (action.action !== "find")
      void vscode.commands
        .executeCommand("workbench.action.focusActiveEditorGroup")
        .then(undefined, () => undefined);
  }

  /** Show the viewer's controls where the changed setting says. */
  setToolbar(toolbar: ToolbarSettings): void {
    this.post({ type: "toolbar", toolbar });
  }

  /** Turn macOS Look Up on or off in the viewer (it is off until the plugin says). */
  setLookUp(enabled: boolean): void {
    this.lookUp = enabled;
    this.post({ type: "lookUp", enabled });
  }

  setViewSettings(settings: ViewSettings): void {
    this.settings = settings;
    this.post({ type: "viewSettings", settings });
  }

  dispose(): void {
    if (this.position) this.options.savePosition(this.position);
    for (const disposable of this.disposables) disposable.dispose();
  }

  private async receive(raw: unknown): Promise<void> {
    const message = parseViewerMessage(raw);
    if (!message) return;
    await this.apply(message);
  }

  private async apply(message: ViewerMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        // A new viewer page: its loads and patch versions start again.
        this.loads = 0;
        this.patchVersion = 0;
        await this.load();
        break;
      case "patch":
        // Stale (an older version) or about the previous bytes: see shared/messages.ts.
        if (!isCurrentPatch(message, this.patchVersion, this.loads)) return;
        this.patchVersion = message.version;
        this.applyPatch(message.patch);
        break;
      case "openExternal":
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
      case "error":
        void vscode.window.showErrorMessage(`PDF viewer: ${message.message}`);
        break;
      default:
        await this.options.route(this, message);
    }
  }

  private applyPatch({ outline, selection, view }: ViewerPatch): void {
    if (outline) this.outline = outline;
    if (view) {
      this.view = view;
      this.position = positionFromView(view);
    }
    if (selection)
      this.selectionState.set(
        selection.selection ?? undefined,
        this.source.sha256,
        selection.image,
      );
    this.changed.fire();
    if (selection) this.selected.fire(this.selectionState.snapshot());
  }

  /** Send the file to the viewer, which (re)opens it. */
  private async load(): Promise<void> {
    this.navigation.unload();
    this.outline = undefined;
    this.view = undefined;
    // Cleared before the new bytes go out: see PdfSelectionState.
    this.selectionState.clear();
    this.changed.fire();
    const bytes = await this.source.read();
    if (!bytes) return;
    this.post({
      type: "load",
      data: bytes.data,
      settings: this.settings,
      ...(this.position ? { position: this.position } : {}),
    });
    this.loads++;
    this.navigation.loadedNow();
    if (this.lookUp) this.post({ type: "lookUp", enabled: true });
  }

  private post(message: HostMessage): void {
    void this.webviewPanel.webview.postMessage(message);
  }
}
