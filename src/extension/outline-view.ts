import * as vscode from 'vscode';
import type { OutlineItem } from '../shared/messages';
import type { PdfPanels } from './pdf-panels';

/**
 * The "PDF Outline" view in the Explorer: the bookmarks of the PDF in the
 * active editor. Clicking an entry opens its page.
 */
export function registerOutlineView(panels: PdfPanels): vscode.Disposable {
  const provider = new OutlineProvider(panels);
  const view = vscode.window.createTreeView('vscodeEmbedPdf.outline', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  return vscode.Disposable.from(view, provider);
}

class OutlineProvider implements vscode.TreeDataProvider<OutlineItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly panels: PdfPanels) {
    this.subscription = panels.onDidChange(() => this.changed.fire());
  }

  getChildren(item?: OutlineItem): OutlineItem[] {
    return item ? item.children : this.panels.active?.outline ?? [];
  }

  getTreeItem(item: OutlineItem): vscode.TreeItem {
    const topLevel = this.panels.active?.outline?.includes(item) ?? false;
    const node = new vscode.TreeItem(
      item.title,
      item.children.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : topLevel ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
    );
    if (item.page !== undefined) {
      node.description = String(item.page);
      node.tooltip = `${item.title} — page ${item.page}`;
      node.command = {
        command: 'vscodeEmbedPdf.goToOutlineItem',
        title: 'Go to page',
        arguments: [item.page, item.top],
      };
    }
    return node;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}
