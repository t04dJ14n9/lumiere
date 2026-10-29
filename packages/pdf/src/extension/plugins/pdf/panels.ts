import * as vscode from "vscode";
import { PdfViewerPanels, VIEW_TYPE } from "../../../host/viewer/panels";
import type { PdfPanel } from "./panel";

export { VIEW_TYPE } from "../../../host/viewer/panels";

/**
 * Every open PDF editor in VS Code (see `PdfViewerPanels`). The active one
 * is the one in the active tab.
 */
export class PdfPanels
  extends PdfViewerPanels<PdfPanel>
  implements vscode.Disposable
{
  private readonly tabListeners: vscode.Disposable[] = [
    vscode.window.tabGroups.onDidChangeTabs(() => this.update()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => this.update()),
  ];

  constructor() {
    super(
      (key, value) =>
        void vscode.commands.executeCommand("setContext", key, value),
    );
  }

  add(panel: PdfPanel): void {
    this.track(panel, {
      onState: (listener) =>
        panel.webviewPanel.onDidChangeViewState(() => listener()),
      onDispose: (listener) => panel.webviewPanel.onDidDispose(listener),
    });
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
  override dispose(): void {
    super.dispose();
    for (const listener of this.tabListeners) {
      listener.dispose();
    }
  }

  /**
   * The panel shown in the active tab. A webview's own `active` flag can
   * lag behind when focus moves between editor groups, so the tab decides and
   * the flag only breaks ties between groups showing the same file.
   */
  protected findActive(panels: ReadonlySet<PdfPanel>): PdfPanel | undefined {
    const group = vscode.window.tabGroups.activeTabGroup;
    const input = group.activeTab?.input;
    if (
      !(input instanceof vscode.TabInputCustom) ||
      input.viewType !== VIEW_TYPE
    ) {
      return undefined;
    }
    const candidates = [...panels].filter(
      (panel) =>
        panel.uri.toString() === input.uri.toString() &&
        panel.webviewPanel.viewColumn === group.viewColumn,
    );
    return (
      candidates.find((panel) => panel.webviewPanel.active) ?? candidates[0]
    );
  }
}
