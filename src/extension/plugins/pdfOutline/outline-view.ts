import * as vscode from 'vscode';
import type { OutlineItem } from '../../../shared/messages';
import { findActiveOutlineItem } from '../../../shared/outline';
import { updateSetting } from '../../settings';
import type { PdfPanel } from '../pdf/panel';
import type { PdfPanels } from '../pdf/panels';
import { OUTLINE_COMMAND_IDS } from '../pdf/registered-commands';

const FOLLOW_SETTING = 'pdfWorkshop.outline.followCursor';
const FOLLOW_CONTEXT = 'pdfWorkshop.outlineFollowCursor';

/**
 * The "PDF Outline" view in the Explorer: the bookmarks of the PDF in the
 * active editor. Clicking an entry opens its page (Go to Outline Item).
 */
export function registerOutlineView(panels: PdfPanels, log: Pick<vscode.LogOutputChannel, 'warn'>): vscode.Disposable {
  const provider = new OutlineProvider(panels);
  const view = vscode.window.createTreeView('pdfWorkshop.outline', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  let disposed = false;
  let followCursor = false;
  let following = false;
  let followed: OutlineItem | undefined;

  // Serialize reveals, then re-read the active panel: a scroll or tab switch
  // during a reveal must finish with the newest position selected.
  // Never rejects; event handlers can safely start it without awaiting it.
  const follow = async (): Promise<void> => {
    if (disposed || following) return;
    following = true;
    try {
      while (!disposed && followCursor && view.visible) {
        const panel = panels.active;
        const state = panel?.view;
        if (!state) break;
        // The offset belongs to readingPage, which can precede current page.
        const item = findActiveOutlineItem(provider.getChildren(), {
          page: state.page,
          top: state.readingPage === state.page ? state.top : 0,
        });
        if (!item || item === followed) break;
        followed = item;
        try {
          await view.reveal(item, { select: true, focus: false, expand: false });
        } catch (error) {
          followed = undefined;
          // Old nodes can disappear while VS Code is resolving their parents.
          if (disposed) break;
          if (panel !== panels.active || !provider.nodes.includes(item)) continue;
          log.warn(`Could not follow the PDF outline: ${String(error)}`);
          break;
        }
      }
    } finally {
      following = false;
    }
  };
  const applyFollowSetting = (): void => {
    const enabled = vscode.workspace.getConfiguration().get<boolean>(FOLLOW_SETTING, false);
    if (enabled !== followCursor) {
      followCursor = enabled;
      followed = undefined;
    }
    void Promise.resolve(vscode.commands.executeCommand('setContext', FOLLOW_CONTEXT, followCursor))
      .catch(error => log.warn(`Could not update the PDF outline context: ${String(error)}`));
    void follow();
  };
  const setFollow = async (enabled: boolean): Promise<void> => {
    await updateSetting(FOLLOW_SETTING, enabled);
    if (!disposed) applyFollowSetting();
  };

  const registration = vscode.Disposable.from(
    new vscode.Disposable(() => { disposed = true; }),
    view,
    provider,
    panels.onDidChange(() => {
      if (provider.refresh()) followed = undefined;
      void follow();
    }),
    view.onDidChangeVisibility(() => {
      followed = undefined;
      void follow();
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(FOLLOW_SETTING)) applyFollowSetting();
    }),
    vscode.commands.registerCommand(OUTLINE_COMMAND_IDS.expandOutline, async () => {
      const panel = panels.active;
      const outline = panel?.outline;
      // reveal's numeric expansion depth is capped by VS Code. Visit every
      // node instead, so arbitrarily deep bookmark trees expand completely.
      for (const item of provider.nodes) {
        if (disposed || panels.active !== panel || panel?.outline !== outline) return;
        try {
          await view.reveal(item, { expand: true, select: false, focus: false });
        } catch (error) {
          if (disposed || panels.active !== panel || panel?.outline !== outline) return;
          throw error;
        }
      }
    }),
    vscode.commands.registerCommand(OUTLINE_COMMAND_IDS.enableOutlineFollowCursor, () => setFollow(true)),
    vscode.commands.registerCommand(OUTLINE_COMMAND_IDS.disableOutlineFollowCursor, () => setFollow(false)),
    // Show the outline, or hide the side bar it is shown in.
    vscode.commands.registerCommand(OUTLINE_COMMAND_IDS.toggleOutline, async () => {
      if (view.visible) await vscode.commands.executeCommand('workbench.action.closeSidebar');
      else await vscode.commands.executeCommand('pdfWorkshop.outline.focus');
    }),
    vscode.commands.registerCommand(OUTLINE_COMMAND_IDS.goToOutlineItem, (page: unknown, top?: unknown) => {
      if (typeof page === 'number') panels.active?.goTo({ page }, typeof top === 'number' ? top : undefined);
    }),
  );
  applyFollowSetting();
  return registration;
}

class OutlineProvider implements vscode.TreeDataProvider<OutlineItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private panel: PdfPanel | undefined;
  private outline: OutlineItem[] | undefined;
  private readonly parents = new Map<OutlineItem, OutlineItem>();
  nodes: OutlineItem[] = [];

  constructor(private readonly panels: PdfPanels) {
    this.refresh();
  }

  /** Page, zoom and selection changes leave the tree's expansion state alone. */
  refresh(): boolean {
    const panel = this.panels.active;
    const outline = panel?.outline;
    if (panel === this.panel && outline === this.outline) return false;
    this.panel = panel;
    this.outline = outline;
    this.parents.clear();
    this.nodes = [];
    const visit = (items: OutlineItem[], parent?: OutlineItem): void => {
      for (const item of items) {
        this.nodes.push(item);
        if (parent) this.parents.set(item, parent);
        visit(item.children, item);
      }
    };
    visit(outline ?? []);
    this.changed.fire();
    return true;
  }

  getChildren(item?: OutlineItem): OutlineItem[] {
    return item ? item.children : this.outline ?? [];
  }

  /** Required by TreeView.reveal for both following and expanding nested nodes. */
  getParent(item: OutlineItem): OutlineItem | undefined {
    return this.parents.get(item);
  }

  getTreeItem(item: OutlineItem): vscode.TreeItem {
    const topLevel = this.outline?.includes(item) ?? false;
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
        command: OUTLINE_COMMAND_IDS.goToOutlineItem,
        title: 'Go to page',
        arguments: [item.page, item.top],
      };
    }
    return node;
  }

  dispose(): void {
    this.changed.dispose();
    this.parents.clear();
    this.nodes = [];
  }
}
