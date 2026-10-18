import * as vscode from "vscode";
import type { RealPaths, WorkerLauncher } from "@workshop/platform";
import type {
  Extensions,
  HostWorkspace,
  WorkspaceStorage,
} from "../../shared/host";
import { createDiagnostics } from "../diagnostics";
import { createWorkspaceFiles } from "../workspace-files";

export function createHostWorkspace(
  realPaths: RealPaths | undefined,
): HostWorkspace {
  return {
    folders: () =>
      (vscode.workspace.workspaceFolders ?? []).map((folder) =>
        folder.uri.toString(),
      ),
    isTrusted: () => vscode.workspace.isTrusted,
    read: async (uri) => vscode.workspace.fs.readFile(vscode.Uri.parse(uri)),
    async stat(uri) {
      const info = await vscode.workspace.fs.stat(vscode.Uri.parse(uri));
      return {
        mtime: info.mtime,
        symbolicLink: Boolean(info.type & vscode.FileType.SymbolicLink),
      };
    },
    watch: watchFile,
    ...(realPaths && {
      realContains: (root, target) =>
        realPaths.isInside(
          vscode.Uri.parse(root).fsPath,
          vscode.Uri.parse(target).fsPath,
        ),
    }),
    files: createWorkspaceFiles(realPaths),
    diagnostics: createDiagnostics(),
    revealTextEditor,
  };
}

/** The extension's workspace state (a VS Code Memento). */
export function createWorkspaceStorage(
  memento: vscode.Memento,
): WorkspaceStorage {
  return {
    get: (key, fallback) => memento.get(key, fallback),
    update: (key, value) => memento.update(key, value),
  };
}

export function createExtensions(workers: WorkerLauncher): Extensions {
  return {
    isInstalled: (id) => Boolean(vscode.extensions.getExtension(id)),
    workers,
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
