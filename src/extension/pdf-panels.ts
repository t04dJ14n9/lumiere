import * as vscode from 'vscode';
import type { PdfPanel } from './pdf-panel';

export const VIEW_TYPE = 'vscodeEmbedPdf.viewer';

/**
 * All open PDF editors, and the one in the active tab. Commands and the
 * outline view act on the active one.
 *
 * Panels are tracked individually, so the same PDF open in two editor groups
 * keeps two independent selections.
 */
export class PdfPanels implements vscode.Disposable {
  private readonly panels = new Set<PdfPanel>();
  private current: PdfPanel | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the active panel changes, or its outline or selection does. */
  readonly onDidChange = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [
    this.changed,
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

  add(panel: PdfPanel): void {
    this.panels.add(panel);
    const subscriptions = [
      panel.webviewPanel.onDidChangeViewState(() => this.update()),
      panel.onDidChange(() => {
        if (panel === this.current) this.publish();
      }),
    ];
    panel.webviewPanel.onDidDispose(() => {
      for (const subscription of subscriptions) subscription.dispose();
      this.panels.delete(panel);
      panel.dispose();
      this.update();
    });
    this.update();
  }

  /** Wait (briefly) for the editor opened for `uri` to register. */
  async waitFor(uri: vscode.Uri, timeoutMs = 5_000): Promise<PdfPanel | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const panel = this.active?.uri.toString() === uri.toString()
        ? this.active
        : [...this.panels].find(candidate => candidate.uri.toString() === uri.toString());
      if (panel) return panel;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return undefined;
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
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
    if (input instanceof vscode.TabInputCustom && input.viewType === VIEW_TYPE) {
      const candidates = [...this.panels].filter(panel =>
        panel.uri.toString() === input.uri.toString() && panel.webviewPanel.viewColumn === group.viewColumn);
      next = candidates.find(panel => panel.webviewPanel.active) ?? candidates[0];
    }
    if (next === this.current) return;
    this.current = next;
    this.publish();
  }

  private publish(): void {
    const panel = this.current;
    void vscode.commands.executeCommand('setContext', 'vscodeEmbedPdf.pdfActive', Boolean(panel));
    void vscode.commands.executeCommand('setContext', 'vscodeEmbedPdf.hasSelection', Boolean(panel?.selection));
    void vscode.commands.executeCommand('setContext', 'vscodeEmbedPdf.outlineLoading', Boolean(panel && !panel.outline));
    this.changed.fire();
  }
}
