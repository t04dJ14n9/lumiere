import * as vscode from "vscode";
import type {
  FileTextEdits,
  HostViews,
  StatusHandle,
  TreeHandle,
  TreeNode,
  TreeSource,
} from "../shared/runtime";
import { cleanEditedUris } from "./rename-save";

/** The VS Code side of `workbench.views` (DESIGN §7.1). */
export function createHostViews(): HostViews {
  return {
    tree: createTree,
    status: createStatus,
    pick,
    ask: async (message, actions) =>
      vscode.window.showInformationMessage(
        message,
        { modal: true },
        ...actions,
      ),
    command: (id, run) => toDisposer(vscode.commands.registerCommand(id, run)),
    activeNote,
    onActiveNoteChanged: (listener) => {
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
    documentText: (uri) =>
      vscode.workspace.textDocuments
        .find((document) => document.uri.toString() === uri)
        ?.getText(),
    setting: (key, fallback) =>
      vscode.workspace.getConfiguration("markdownWorkbench").get(key, fallback),
    onWillRename: (listener) =>
      toDisposer(
        vscode.workspace.onWillRenameFiles((event) => {
          const renames = event.files.map(({ oldUri, newUri }) => ({
            oldUri: oldUri.toString(),
            newUri: newUri.toString(),
          }));
          event.waitUntil(
            listener(renames).then((files) => {
              saveAfterRename(files);
              return workspaceEdit(files);
            }),
          );
        }),
      ),
  };
}

/**
 * Obsidian writes link updates straight to disk. Save the notes the update
 * edited once the rename lands, unless they already had unsaved changes, so
 * a closed editor's "Don't Save" can't leave a stale edited buffer behind.
 */
function saveAfterRename(files: readonly FileTextEdits[]): void {
  const uris = cleanEditedUris(files, (uri) =>
    vscode.workspace.textDocuments.some(
      (document) => document.uri.toString() === uri && document.isDirty,
    ),
  );
  if (uris.length === 0) {
    return;
  }
  const done = vscode.workspace.onDidRenameFiles(() => {
    done.dispose();
    for (const document of vscode.workspace.textDocuments) {
      if (uris.includes(document.uri.toString()) && document.isDirty) {
        void document.save();
      }
    }
  });
}

function toDisposer(disposable: vscode.Disposable): () => void {
  return () => disposable.dispose();
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

function createTree(viewId: string, source: TreeSource): TreeHandle {
  const changed = new vscode.EventEmitter<TreeNode | undefined>();
  const view = vscode.window.createTreeView<TreeNode>(viewId, {
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
    reveal: (node) => {
      if (view.visible) {
        void view.reveal(node, { select: true, focus: false });
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
}

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

function createStatus(id: string, priority: number): StatusHandle {
  const item = vscode.window.createStatusBarItem(
    id,
    vscode.StatusBarAlignment.Right,
    priority,
  );
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

const pick: HostViews["pick"] = (options) => {
  const quickPick = vscode.window.createQuickPick<
    vscode.QuickPickItem & { index: number }
  >();
  quickPick.placeholder = options.placeholder;
  // The items are already ranked; VS Code must not filter or re-sort them.
  quickPick.matchOnDescription = false;
  (quickPick as { sortByLabel?: boolean }).sortByLabel = false;
  let items = options.items("");
  const show = () => {
    quickPick.items = items.map((item, index) => ({
      label: item.label,
      ...(item.description === undefined
        ? {}
        : { description: item.description }),
      ...(item.detail === undefined ? {} : { detail: item.detail }),
      alwaysShow: true,
      index,
    }));
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

function workspaceEdit(files: readonly FileTextEdits[]): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const file of files) {
    for (const change of file.edits) {
      edit.replace(
        vscode.Uri.parse(file.uri),
        new vscode.Range(
          change.start.line,
          change.start.col,
          change.end.line,
          change.end.col,
        ),
        change.text,
      );
    }
  }
  return edit;
}
