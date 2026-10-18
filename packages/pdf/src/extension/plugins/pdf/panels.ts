import * as vscode from "vscode";
import {
  DEFAULT_TOOLBAR_SETTINGS,
  type ToolbarSettings,
} from "../../../shared/toolbar-settings";
import type { PdfPanel, PluginMessage } from "./panel";
import type { ViewState } from "../../../shared/view-state";

export const VIEW_TYPE = "lumiere.pdf.viewer";

type Handler<T extends PluginMessage["type"]> = (
  panel: PdfPanel,
  message: Extract<PluginMessage, { type: T }>,
) => unknown;
type AnyHandler = (panel: PdfPanel, message: PluginMessage) => unknown;

/**
 * All open PDF editors, and the one in the active tab: the `panels` service
 * the other plugins build on. Commands and the outline view act on the active
 * one.
 *
 * Invariants:
 *
 * - Panels are tracked individually, never by path, so the same PDF open in
 *   two editor groups keeps two independent selections.
 * - Each viewer message type a plugin handles has exactly one handler; with
 *   its plugin stopped, the message is ignored.
 */
export class PdfPanels implements vscode.Disposable {
  private readonly panels = new Set<PdfPanel>();
  private readonly panelSubscriptions = new Map<
    PdfPanel,
    vscode.Disposable[]
  >();
  private current: PdfPanel | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the active panel changes, or its outline, selection or view does. */
  readonly onDidChange = this.changed.event;
  private readonly opened = new vscode.EventEmitter<PdfPanel>();
  /** Fires when an editor opens. */
  readonly onDidOpen = this.opened.event;
  private readonly handlers = new Map<PluginMessage["type"], AnyHandler>();
  private toolbar: () => ToolbarSettings = () => DEFAULT_TOOLBAR_SETTINGS;
  private readonly disposables: vscode.Disposable[] = [
    this.changed,
    this.opened,
    vscode.window.tabGroups.onDidChangeTabs(() => this.update()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => this.update()),
  ];

  get active(): PdfPanel | undefined {
    return this.current;
  }

  /** Every open PDF editor. */
  get all(): readonly PdfPanel[] {
    return [...this.panels];
  }

  /** Handle a viewer message type (for as long as the returned disposable lives). */
  handle<T extends PluginMessage["type"]>(
    type: T,
    handler: Handler<T>,
  ): vscode.Disposable {
    if (this.handlers.has(type)) {
      throw new Error(`A plugin already handles ${type} messages`);
    }
    const entry = handler as AnyHandler;
    this.handlers.set(type, entry);
    return new vscode.Disposable(() => {
      if (this.handlers.get(type) === entry) {
        this.handlers.delete(type);
      }
    });
  }

  async route(panel: PdfPanel, message: PluginMessage): Promise<void> {
    await this.handlers.get(message.type)?.(panel, message);
  }

  /** Where the toolbar plugin says new viewers put their controls. */
  provideViewerToolbar(settings: () => ToolbarSettings): vscode.Disposable {
    this.toolbar = settings;
    return new vscode.Disposable(() => {
      if (this.toolbar === settings) {
        this.toolbar = () => DEFAULT_TOOLBAR_SETTINGS;
      }
    });
  }

  viewerToolbar(): ToolbarSettings {
    return this.toolbar();
  }

  add(panel: PdfPanel): void {
    this.panels.add(panel);
    this.panelSubscriptions.set(panel, [
      panel.webviewPanel.onDidChangeViewState(() => this.update()),
      panel.onDidChange(() => {
        if (panel === this.current) {
          this.publish();
        }
      }),
      panel.webviewPanel.onDidDispose(() => {
        this.forget(panel);
        this.update();
      }),
    ]);
    this.opened.fire(panel);
    this.update();
  }

  /** Wait (briefly) for the editor opened for `uri` to register. */
  async waitFor(
    uri: vscode.Uri,
    timeoutMs = 5_000,
    column?: number,
    current: () => boolean = () => true,
  ): Promise<PdfPanel | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && current()) {
      const panel =
        this.active?.uri.toString() === uri.toString() &&
        (column === undefined || this.active.webviewPanel.viewColumn === column)
          ? this.active
          : undefined;
      if (panel) {
        return panel;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  /**
   * Stop tracking every editor. The webviews themselves belong to VS Code
   * and stay open; they no longer talk to this extension.
   */
  dispose(): void {
    for (const panel of [...this.panels]) {
      this.forget(panel);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.handlers.clear();
  }

  private forget(panel: PdfPanel): void {
    for (const subscription of this.panelSubscriptions.get(panel) ?? []) {
      subscription.dispose();
    }
    this.panelSubscriptions.delete(panel);
    this.panels.delete(panel);
    panel.dispose();
    if (this.current === panel) {
      this.current = undefined;
    }
  }

  /**
   * Find the panel shown in the active tab. A webview's own `active` flag can
   * lag behind when focus moves between editor groups, so the tab decides and
   * the flag only breaks ties between groups showing the same file.
   */
  private update(): void {
    const group = vscode.window.tabGroups.activeTabGroup;
    const input = group.activeTab?.input;
    let next: PdfPanel | undefined;
    if (
      input instanceof vscode.TabInputCustom &&
      input.viewType === VIEW_TYPE
    ) {
      const candidates = [...this.panels].filter(
        (panel) =>
          panel.uri.toString() === input.uri.toString() &&
          panel.webviewPanel.viewColumn === group.viewColumn,
      );
      next =
        candidates.find((panel) => panel.webviewPanel.active) ?? candidates[0];
    }
    if (next === this.current) {
      return;
    }
    this.current = next;
    this.publish();
  }

  private publish(): void {
    for (const [key, value] of Object.entries(contextKeys(this.current))) {
      void vscode.commands.executeCommand(
        "setContext",
        `lumiere.pdf.${key}`,
        value,
      );
    }
    this.changed.fire();
  }
}

/**
 * The context keys menus and keybindings read for the active PDF; for the
 * editor title actions, which fit and tool buttons to show, and whether there
 * is a page to go back or forward to.
 */
function contextKeys(panel: PdfPanel | undefined): Record<string, unknown> {
  const view = panel?.view;
  return {
    pdfActive: Boolean(panel),
    hasSelection: Boolean(panel?.selection),
    outlineLoading: Boolean(panel && !panel.outline),
    ...(view ? viewKeys(view) : NO_VIEW),
  };
}

const NO_VIEW = {
  fit: "",
  tool: "text",
  pageLayout: "single",
  scrollMode: "continuous",
  scrollDirection: "vertical",
  canGoBack: false,
  canGoForward: false,
};

function viewKeys(view: ViewState): typeof NO_VIEW {
  return {
    fit: view.fit ?? "",
    tool: view.tool,
    pageLayout: view.pageLayout,
    scrollMode: view.scrollMode,
    scrollDirection: view.scrollDirection,
    canGoBack: view.canGoBack,
    canGoForward: view.canGoForward,
  };
}
