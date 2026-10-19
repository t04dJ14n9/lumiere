import * as vscode from "vscode";
import type { OutlineItem } from "../../../shared/messages";
import {
  findActiveOutlineItem,
  flattenOutlineForPicker,
} from "../../../shared/outline";
import type { PdfSettings } from "../../settings";
import type { PdfPanel } from "../pdf/panel";
import type { PdfPanels } from "../pdf/panels";
import { OUTLINE_COMMAND_IDS } from "../pdf/registered-commands";
import { createOutlineFocus } from "./focus";

const FOLLOW_SETTING = "lumiere.pdf.outline.followCursor";
const FOLLOW_CONTEXT = "lumiere.pdf.outlineFollowCursor";

/**
 * The "PDF Outline" view in the Explorer: the bookmarks of the PDF in the
 * active editor. Clicking an entry opens its page (Go to Outline Item).
 */
export function registerOutlineView(
  panels: PdfPanels,
  settings: PdfSettings,
  log: Pick<vscode.LogOutputChannel, "warn">,
): vscode.Disposable {
  let disposed = false;
  const provider = new OutlineProvider(panels);
  const view = vscode.window.createTreeView("lumiere.pdf.outline", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  const follower = new OutlineFollower(view, provider, panels, log);
  const outlineFocus = createOutlineFocus({
    execute: (command) => vscode.commands.executeCommand(command),
    focusEditor: () =>
      vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup"),
    activeCustomEditorViewType: () => {
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      return input instanceof vscode.TabInputCustom
        ? input.viewType
        : undefined;
    },
  });
  const registration = vscode.Disposable.from(
    // First, so nothing that is still running reveals into a disposed view.
    follower,
    new vscode.Disposable(() => outlineFocus.dispose()),
    view,
    provider,
    panels.onDidChange(() => {
      follower.treeChanged(provider.refresh());
      outlineFocus.sync(Boolean(panels.active));
    }),
    view.onDidChangeVisibility(() => follower.treeChanged(true)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(FOLLOW_SETTING)) {
        follower.applySetting();
      }
    }),
    ...outlineCommands({
      panels,
      view,
      provider,
      follower,
      settings,
      isDisposed: () => disposed,
    }),
  );
  follower.applySetting();
  outlineFocus.sync(Boolean(panels.active));
  return new vscode.Disposable(() => {
    disposed = true;
    registration.dispose();
  });
}

/** With "follow cursor" on, keeps the bookmark of the reading position selected. */
class OutlineFollower implements vscode.Disposable {
  private disposed = false;
  private enabled = false;
  private following = false;
  private followed: OutlineItem | undefined;

  constructor(
    private readonly view: vscode.TreeView<OutlineItem>,
    private readonly provider: OutlineProvider,
    private readonly panels: PdfPanels,
    private readonly log: Pick<vscode.LogOutputChannel, "warn">,
  ) {}

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
  }

  /** The reading position moved; with a new tree, select from scratch. */
  treeChanged(newTree: boolean): void {
    if (newTree) {
      this.followed = undefined;
    }
    void this.follow();
  }

  applySetting(): void {
    const enabled = vscode.workspace
      .getConfiguration()
      .get<boolean>(FOLLOW_SETTING, false);
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      this.followed = undefined;
    }
    void Promise.resolve(
      vscode.commands.executeCommand("setContext", FOLLOW_CONTEXT, enabled),
    ).catch((error) =>
      this.log.warn(
        `Could not update the PDF outline context: ${String(error)}`,
      ),
    );
    void this.follow();
  }

  async setEnabled(enabled: boolean, settings: PdfSettings): Promise<void> {
    await settings.update(FOLLOW_SETTING, enabled);
    if (!this.disposed) {
      this.applySetting();
    }
  }

  /**
   * Serialize reveals, then re-read the active panel: a scroll or tab switch
   * during a reveal must finish with the newest position selected. Never
   * rejects; event handlers can start it without awaiting it.
   */
  private async follow(): Promise<void> {
    if (this.disposed || this.following) {
      return;
    }
    this.following = true;
    try {
      while (!this.disposed && this.enabled && this.view.visible) {
        if (!(await this.revealNext())) {
          break;
        }
      }
    } finally {
      this.following = false;
    }
  }

  /** Reveal the reading position's bookmark; false when there is no more to do. */
  private async revealNext(): Promise<boolean> {
    const panel = this.panels.active;
    const state = panel?.view;
    if (!state) {
      return false;
    }
    // The offset belongs to readingPage, which can precede current page.
    const item = findActiveOutlineItem(this.provider.getChildren(), {
      page: state.page,
      top: state.readingPage === state.page ? state.top : 0,
    });
    if (!item || item === this.followed) {
      return false;
    }
    this.followed = item;
    try {
      await this.view.reveal(item, {
        select: true,
        focus: false,
        expand: false,
      });
      return true;
    } catch (error) {
      this.followed = undefined;
      if (this.disposed) {
        return false;
      }
      // Old nodes can disappear while VS Code is resolving their parents.
      if (panel !== this.panels.active || !this.provider.nodes.includes(item)) {
        return true;
      }
      this.log.warn(`Could not follow the PDF outline: ${String(error)}`);
      return false;
    }
  }
}

interface OutlineParts {
  panels: PdfPanels;
  view: vscode.TreeView<OutlineItem>;
  provider: OutlineProvider;
  follower: OutlineFollower;
  settings: PdfSettings;
  isDisposed: () => boolean;
}

function outlineCommands(parts: OutlineParts): vscode.Disposable[] {
  const { panels, view, follower, settings } = parts;
  return [
    vscode.commands.registerCommand(OUTLINE_COMMAND_IDS.expandOutline, () =>
      expandAll(parts),
    ),
    vscode.commands.registerCommand(
      OUTLINE_COMMAND_IDS.enableOutlineFollowCursor,
      () => follower.setEnabled(true, settings),
    ),
    vscode.commands.registerCommand(
      OUTLINE_COMMAND_IDS.disableOutlineFollowCursor,
      () => follower.setEnabled(false, settings),
    ),
    // Toolbar / command palette: show the outline, or hide the side bar it is
    // shown in. Ctrl+Alt+O uses separate keybindings (focus vs closeSidebar by
    // focusedView) so it still reveals bookmark titles when the Explorer is open.
    vscode.commands.registerCommand(OUTLINE_COMMAND_IDS.toggleOutline, () =>
      vscode.commands.executeCommand(
        view.visible
          ? "workbench.action.closeSidebar"
          : "lumiere.pdf.outline.focus",
      ),
    ),
    vscode.commands.registerCommand(
      OUTLINE_COMMAND_IDS.goToOutlineItem,
      (page: unknown, top?: unknown) => goToOutlineItem(parts, page, top),
    ),
  ];
}

/**
 * Navigate to an outline destination: with a page (tree click), go there; with
 * no page (palette / Ctrl/Cmd+Shift+O), offer a searchable Quick Pick of
 * bookmarks — the PDF counterpart of Go to Symbol / Markdown Go to Heading.
 *
 * `panel.outline` is `undefined` while the viewer is still reading bookmarks
 * (see PdfPanel.load); only a real `[]` means the PDF has no outline. The
 * picker stays open and refreshes when the outline arrives or is replaced.
 */
async function goToOutlineItem(
  { panels, isDisposed }: OutlineParts,
  page: unknown,
  top?: unknown,
): Promise<void> {
  if (typeof page === "number") {
    panels.active?.goTo({ page }, typeof top === "number" ? top : undefined);
    return;
  }
  const panel = panels.active;
  if (!panel || isDisposed()) {
    return;
  }
  type Pick = vscode.QuickPickItem & {
    page: number;
    top?: number;
    /** Outline array identity that produced this row; must still be current. */
    outline: OutlineItem[];
  };
  const picker = vscode.window.createQuickPick<Pick>();
  picker.title = "Go to Outline Item";
  picker.matchOnDescription = true;
  picker.matchOnDetail = true;

  const applyOutline = (): void => {
    if (isDisposed() || panels.active !== panel) {
      picker.hide();
      return;
    }
    const outline = panel.outline;
    if (outline === undefined) {
      picker.busy = true;
      picker.placeholder = "Loading outline…";
      picker.items = [];
      return;
    }
    picker.busy = false;
    const entries = flattenOutlineForPicker(outline);
    picker.items = entries.map((entry) => ({
      label: entry.title,
      description: entry.description,
      ...(entry.detail ? { detail: entry.detail } : {}),
      page: entry.page,
      ...(entry.top !== undefined ? { top: entry.top } : {}),
      outline,
    }));
    picker.placeholder = entries.length
      ? "Go to outline item…"
      : "No outline in this PDF.";
  };

  applyOutline();
  const subscription = panels.onDidChange(applyOutline);
  const choice = await new Promise<Pick | undefined>((resolve) => {
    picker.onDidAccept(() => {
      resolve(picker.selectedItems[0]);
      picker.hide();
    });
    picker.onDidHide(() => resolve(undefined));
    picker.show();
  });
  subscription.dispose();
  picker.dispose();

  // Reject after dispose, editor switch/close, or outline reload (stale page/top).
  if (
    isDisposed() ||
    !choice ||
    panels.active !== panel ||
    panel.outline !== choice.outline
  ) {
    return;
  }
  panel.goTo({ page: choice.page }, choice.top);
}

/**
 * Expand every bookmark. reveal's numeric expansion depth is capped by VS
 * Code, so visit every node: arbitrarily deep trees expand completely.
 */
async function expandAll({
  panels,
  view,
  provider,
  follower,
}: OutlineParts): Promise<void> {
  const panel = panels.active;
  const outline = panel?.outline;
  const stale = () =>
    follower.isDisposed ||
    panels.active !== panel ||
    panel?.outline !== outline;
  for (const item of provider.nodes) {
    if (stale()) {
      return;
    }
    try {
      await view.reveal(item, { expand: true, select: false, focus: false });
    } catch (error) {
      if (stale()) {
        return;
      }
      throw error;
    }
  }
}

class OutlineProvider
  implements vscode.TreeDataProvider<OutlineItem>, vscode.Disposable
{
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
    if (panel === this.panel && outline === this.outline) {
      return false;
    }
    this.panel = panel;
    this.outline = outline;
    this.parents.clear();
    this.nodes = [];
    const visit = (items: OutlineItem[], parent?: OutlineItem): void => {
      for (const item of items) {
        this.nodes.push(item);
        if (parent) {
          this.parents.set(item, parent);
        }
        visit(item.children, item);
      }
    };
    visit(outline ?? []);
    this.changed.fire();
    return true;
  }

  getChildren(item?: OutlineItem): OutlineItem[] {
    return item ? item.children : (this.outline ?? []);
  }

  /** Required by TreeView.reveal for both following and expanding nested nodes. */
  getParent(item: OutlineItem): OutlineItem | undefined {
    return this.parents.get(item);
  }

  getTreeItem(item: OutlineItem): vscode.TreeItem {
    const node = new vscode.TreeItem(item.title, this.collapsibleState(item));
    if (item.page !== undefined) {
      node.description = String(item.page);
      node.tooltip = `${item.title} — page ${item.page}`;
      node.command = {
        command: OUTLINE_COMMAND_IDS.goToOutlineItem,
        title: "Go to page",
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

  /** Top-level bookmarks start expanded, deeper ones collapsed. */
  private collapsibleState(item: OutlineItem): vscode.TreeItemCollapsibleState {
    if (item.children.length === 0) {
      return vscode.TreeItemCollapsibleState.None;
    }
    return this.outline?.includes(item)
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;
  }
}
