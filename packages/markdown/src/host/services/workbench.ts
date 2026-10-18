import * as vscode from "vscode";
import type {
  ActiveEditor,
  Clipboard,
  Dialogs,
  StatusHandle,
  TreeNode,
  WorkbenchViews,
} from "../../shared/host";
import { createWorkshopPanel } from "../panel-adapter";
import { toDisposer } from "./documents";

export function createClipboard(): Clipboard {
  return {
    read: async () => vscode.env.clipboard.readText(),
    write: async (text) => vscode.env.clipboard.writeText(text),
  };
}

export function createDialogs(): Dialogs {
  return {
    error(message) {
      void vscode.window.showErrorMessage(message);
    },
    inform(message) {
      void vscode.window.showInformationMessage(message);
    },
    ask: async (message, actions) =>
      vscode.window.showInformationMessage(
        message,
        { modal: true },
        ...actions,
      ),
    pick,
    input: async (options) =>
      vscode.window.showInputBox({
        prompt: options.prompt,
        value: options.value,
        validateInput: options.validate,
      }),
  };
}

export function createWorkbenchViews(extensionUri: vscode.Uri): WorkbenchViews {
  return {
    tree: createTree,
    status: createStatus,
    panel: createWorkshopPanel(extensionUri),
  };
}

export function createActiveEditor(): ActiveEditor {
  return {
    note: activeNote,
    onNoteChanged: (listener) => {
      const subscriptions = [
        vscode.window.tabGroups.onDidChangeTabs(() => listener()),
        vscode.window.tabGroups.onDidChangeTabGroups(() => listener()),
      ];
      return () => subscriptions.forEach((item) => item.dispose());
    },
    textEditor,
    onTextSelectionChanged: (listener) =>
      toDisposer(
        vscode.window.onDidChangeTextEditorSelection(() => listener()),
      ),
  };
}

/** The note in the active tab, whether this extension's editor or a text editor. */
function activeNote(): string | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  const isEditorTab =
    input instanceof vscode.TabInputCustom ||
    input instanceof vscode.TabInputText;
  if (!isEditorTab || !/\.md$/i.test(input.uri.path)) {
    return undefined;
  }
  return input.uri.toString();
}

function textEditor(uri: string) {
  const editor = vscode.window.visibleTextEditors.find(
    (candidate) => candidate.document.uri.toString() === uri,
  );
  if (!editor) {
    return undefined;
  }
  return {
    text: editor.document.getText(),
    selection: editor.selections
      .map((selection) => editor.document.getText(selection))
      .join("\n"),
  };
}

const createTree: WorkbenchViews["tree"] = (viewId, source, options) => {
  const changed = new vscode.EventEmitter<TreeNode | undefined>();
  const view = vscode.window.createTreeView<TreeNode>(viewId, {
    ...options,
    treeDataProvider: {
      onDidChangeTreeData: changed.event,
      getChildren: (node) => (node ? source.children(node) : source.roots()),
      getParent: (node) => source.parent?.(node),
      getTreeItem: treeItem,
    },
  });
  return {
    refresh: () => changed.fire(undefined),
    setMessage: (message) => {
      // VS Code removes the message when it is set to undefined; its typing
      // (`message?: string`) does not say so, and deleting the property
      // would not reach the view.
      (view as { message: string | undefined }).message = message;
    },
    reveal: async (node, options) => {
      if (view.visible) {
        await view.reveal(node, { select: true, focus: false, ...options });
      }
    },
    get visible() {
      return view.visible;
    },
    onVisibilityChanged: (listener) =>
      toDisposer(
        view.onDidChangeVisibility((event) => listener(event.visible)),
      ),
    dispose: () => {
      view.dispose();
      changed.dispose();
    },
  };
};

function collapsibleState(node: TreeNode): vscode.TreeItemCollapsibleState {
  if (node.expanded === undefined) {
    return vscode.TreeItemCollapsibleState.None;
  }
  return node.expanded
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed;
}

function treeItem(node: TreeNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label, collapsibleState(node));
  item.id = node.id;
  if (node.description !== undefined) {
    item.description = node.description;
  }
  if (node.tooltip !== undefined) {
    item.tooltip = node.tooltip;
  }
  if (node.resourceUri) {
    item.resourceUri = vscode.Uri.parse(node.resourceUri);
  }
  if (node.icon) {
    item.iconPath = new vscode.ThemeIcon(node.icon);
  }
  if (node.command) {
    item.command = {
      title: node.label,
      command: node.command.id,
      ...(node.command.args && { arguments: node.command.args }),
    };
  }
  return item;
}

function createStatus(
  id: string,
  priority: number,
  options?: { alignment?: "left" | "right" },
): StatusHandle {
  const alignment =
    options?.alignment === "left"
      ? vscode.StatusBarAlignment.Left
      : vscode.StatusBarAlignment.Right;
  const item = vscode.window.createStatusBarItem(id, alignment, priority);
  return {
    show: (text, tooltip, command) => {
      item.text = text;
      item.tooltip = tooltip;
      item.command = command;
      item.show();
    },
    hide: () => item.hide(),
    dispose: () => item.dispose(),
  };
}

const pick: Dialogs["pick"] = (options) => {
  const quickPick = vscode.window.createQuickPick<
    vscode.QuickPickItem & { index: number }
  >();
  quickPick.placeholder = options.placeholder;
  // The items are already ranked; VS Code must not filter or re-sort them.
  quickPick.matchOnDescription = false;
  (quickPick as { sortByLabel?: boolean }).sortByLabel = false;
  let items = options.items("");
  const show = () => {
    quickPick.items = pickRows(items);
  };
  show();
  quickPick.onDidChangeValue((query) => {
    items = options.items(query);
    show();
  });
  return new Promise((resolve) => {
    quickPick.onDidAccept(() => {
      const item = items[quickPick.selectedItems[0]?.index ?? -1];
      resolve({ ...(item && { item }), query: quickPick.value });
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      resolve(undefined);
      quickPick.dispose();
    });
    quickPick.show();
  });
};

/** Quick pick rows, with a separator above each new group. */
function pickRows(
  items: readonly {
    label: string;
    description?: string;
    detail?: string;
    group?: string;
  }[],
): (vscode.QuickPickItem & { index: number })[] {
  const shown: (vscode.QuickPickItem & { index: number })[] = [];
  let group: string | undefined;
  items.forEach((item, index) => {
    if (item.group !== undefined && item.group !== group) {
      shown.push({
        label: item.group,
        kind: vscode.QuickPickItemKind.Separator,
        index: -1,
      });
    }
    group = item.group;
    shown.push({
      label: item.label,
      ...(item.description === undefined
        ? {}
        : { description: item.description }),
      ...(item.detail === undefined ? {} : { detail: item.detail }),
      alwaysShow: true,
      index,
    });
  });
  return shown;
}
