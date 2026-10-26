import * as vscode from "vscode";
import type {
  Extensions,
  HostWorkspace,
  VaultCodeTrust,
  WorkspaceStorage,
} from "../../shared/host";
import { createDiagnostics } from "../diagnostics";
import { nodeWorkerLauncher } from "../node-workers";
import { workersFolder } from "../running-extension";
import { realContains } from "../real-contains";
import { createWorkspaceFiles } from "../workspace-files";

export function createHostWorkspace(): HostWorkspace {
  return {
    folders: () =>
      (vscode.workspace.workspaceFolders ?? []).map((folder) =>
        folder.uri.toString(),
      ),
    isTrusted: () => vscode.workspace.isTrusted,
    vaultCode: workspaceTrust,
    read: async (uri) => vscode.workspace.fs.readFile(vscode.Uri.parse(uri)),
    async stat(uri) {
      const info = await vscode.workspace.fs.stat(vscode.Uri.parse(uri));
      return {
        mtime: info.mtime,
        symbolicLink: Boolean(info.type & vscode.FileType.SymbolicLink),
      };
    },
    realContains,
    watch: watchFile,
    files: createWorkspaceFiles(),
    diagnostics: createDiagnostics(),
    revealTextEditor,
  };
}

/**
 * VS Code asks for trust itself, once for the whole window, and offers it
 * again from its Restricted Mode banner; a vault's code follows that answer.
 */
const workspaceTrust: VaultCodeTrust = {
  answer: () => vscode.workspace.isTrusted,
  request: async () => vscode.workspace.isTrusted,
  onDidChange(listener) {
    const subscription = vscode.workspace.onDidGrantWorkspaceTrust(listener);
    return () => subscription.dispose();
  },
};

/** The extension's workspace state (a VS Code Memento). */
export function createWorkspaceStorage(
  memento: vscode.Memento,
): WorkspaceStorage {
  return {
    get: (key, fallback) => memento.get(key, fallback),
    update: (key, value) => memento.update(key, value),
  };
}

export function createExtensions(extensionUri: vscode.Uri): Extensions {
  return {
    isInstalled: (id) => Boolean(vscode.extensions.getExtension(id)),
    workers: nodeWorkerLauncher(workersFolder(extensionUri)),
  };
}

/** Changes to one file, through a watcher on its folder. */
function watchFile(uri: string, listener: () => void): () => void {
  const target = vscode.Uri.parse(uri);
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.joinPath(target, ".."), "*"),
  );
  const changed = (file: vscode.Uri) => {
    if (file.toString() === target.toString()) {
      listener();
    }
  };
  const subscriptions = [
    watcher,
    watcher.onDidCreate(changed),
    watcher.onDidChange(changed),
    watcher.onDidDelete(changed),
  ];
  return () => subscriptions.forEach((subscription) => subscription.dispose());
}

async function revealTextEditor(uri: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.parse(uri),
  );
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true,
    preserveFocus: false,
  });
}
