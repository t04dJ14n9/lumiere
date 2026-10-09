import * as vscode from 'vscode';
import { parseViewerMessage, type HostMessage, type OutlineItem, type ViewerMessage } from '../../../shared/messages';
import type { PdfLocation } from '../../../shared/pdf-location';
import type { PdfSelection } from '../../../shared/selection';
import type { ToolbarSettings } from '../../../shared/toolbar-settings';
import type { ViewerAction, ViewState } from '../../../shared/view-state';
import { PdfNavigation } from './navigation';
import { PdfSelectionState, type SelectionSnapshot } from './selection';
import { PdfSource } from './source';
import { viewerHtml } from './webview-html';

/** Messages the panel leaves to plugins (see `PdfPanels.handle`). */
export type PluginMessage = Extract<ViewerMessage, { type: 'copyLinkForAgent' | 'toggleOutline' | 'floatingDock' }>;

export interface PanelOptions {
  extensionUri: vscode.Uri;
  /** The toolbar layout for the first paint. */
  toolbar: ToolbarSettings;
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
  private readonly selected = new vscode.EventEmitter<SelectionSnapshot | undefined>();
  /** Fires with each new selection (or none), after `onDidChange`. */
  readonly onDidChangeSelection = this.selected.event;

  private readonly source: PdfSource;
  private readonly selectionState = new PdfSelectionState();
  private readonly navigation: PdfNavigation;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    readonly uri: vscode.Uri,
    readonly webviewPanel: vscode.WebviewPanel,
    private readonly options: PanelOptions,
  ) {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(options.extensionUri, 'dist', 'webview')],
    };
    this.navigation = new PdfNavigation(message => this.post(message));
    this.source = new PdfSource(uri, () => void this.load());
    this.disposables.push(
      this.changed,
      this.selected,
      this.source,
      webview.onDidReceiveMessage(message => this.receive(message)),
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
  }

  /** Show the viewer's controls where the changed setting says. */
  setToolbar(toolbar: ToolbarSettings): void {
    this.post({ type: 'toolbar', toolbar });
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }

  private async receive(raw: unknown): Promise<void> {
    const message = parseViewerMessage(raw);
    if (!message) return;
    await this.apply(message);
  }

  private async apply(message: ViewerMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.load();
        break;
      case 'outline':
        this.outline = message.items;
        this.changed.fire();
        break;
      case 'selection':
        this.selectionState.set(message.selection ?? undefined, this.source.sha256, message.image);
        this.changed.fire();
        this.selected.fire(this.selectionState.snapshot());
        break;
      case 'view':
        this.view = message.view;
        this.changed.fire();
        break;
      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
      case 'error':
        void vscode.window.showErrorMessage(`PDF viewer: ${message.message}`);
        break;
      default:
        await this.options.route(this, message);
    }
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
    this.post({ type: 'load', data: bytes.data });
    this.navigation.loadedNow();
  }

  private post(message: HostMessage): void {
    void this.webviewPanel.webview.postMessage(message);
  }
}
