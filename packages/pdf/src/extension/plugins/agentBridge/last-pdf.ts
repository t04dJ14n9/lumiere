/**
 * Remembers PDF editors in recency order. When the user switches to another
 * editor (a note, an agent chat), no PDF is the active tab any more. The
 * plugin owns one long-lived instance shared by the envelope command and the
 * MCP server so a late MCP start still sees PDFs looked at earlier.
 *
 * Closing the latest pane must not fall back to an older insertion-order
 * panel: pick the newest still-open pane. That pane may have no selection;
 * AgentHandoff.envelope() then returns undefined rather than an older pane's
 * selection.
 */
import type * as vscode from "vscode";
import type { PdfPanel } from "../pdf/panel";
import type { PdfPanels } from "../pdf/panels";

export class LastPdf implements vscode.Disposable {
  /** Oldest → newest. Closed panes stay until pruned on read. */
  private readonly recent: PdfPanel[] = [];
  private readonly subscription: vscode.Disposable;

  constructor(private readonly panels: PdfPanels) {
    // Seed the currently active PDF so a tracker created while a PDF is
    // already focused (MCP start) remembers it after focus leaves.
    if (panels.active) {
      this.touch(panels.active);
    }
    this.subscription = panels.onDidChange(() => {
      if (panels.active) {
        this.touch(panels.active);
      }
      this.prune();
    });
  }

  get panel(): PdfPanel | undefined {
    if (this.panels.active) {
      return this.panels.active;
    }
    this.prune();
    return this.recent[this.recent.length - 1];
  }

  dispose(): void {
    this.subscription.dispose();
  }

  private touch(panel: PdfPanel): void {
    const index = this.recent.indexOf(panel);
    if (index >= 0) {
      this.recent.splice(index, 1);
    }
    this.recent.push(panel);
  }

  private prune(): void {
    const open = new Set(this.panels.all);
    for (let i = this.recent.length - 1; i >= 0; i--) {
      if (!open.has(this.recent[i]!)) {
        this.recent.splice(i, 1);
      }
    }
  }
}
