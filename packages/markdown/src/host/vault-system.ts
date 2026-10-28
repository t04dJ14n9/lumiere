import * as vscode from "vscode";
import type { Configuration } from "../shared/configuration";
import { createConfiguration } from "./configuration-access";
import { createHash } from "node:crypto";
import type {
  FileEvent,
  ListedFile,
  SnapshotStore,
  VaultSettings,
  VaultSystem,
} from "../plugins/vault/api";
import { isIgnoredPath } from "../plugins/vault/exclusion";
import { createVaultParser } from "./vault-parser";
import { workerPath } from "./running-extension";

/** Directory reads and stats run this many at a time while listing a vault. */
export const STAT_CONCURRENCY = 32;

/** The VS Code side of the vault plugin (DESIGN §12). */
export function createVaultSystem(
  context: vscode.ExtensionContext,
  configuration: Configuration = createConfiguration(),
): VaultSystem {
  return {
    workspaceFolder: (uri) =>
      vscode.workspace
        .getWorkspaceFolder(vscode.Uri.parse(uri))
        ?.uri.toString(),
    workspaceFolders: () =>
      (vscode.workspace.workspaceFolders ?? []).map((folder) =>
        folder.uri.toString(),
      ),
    exists,
    list: listVault,
    read: async (uri) => vscode.workspace.fs.readFile(vscode.Uri.parse(uri)),
    watch: watchVault,
    store: (root) => snapshotStore(context.storageUri, root),
    settings: (root) => vaultSettings(configuration, root),
    onSettingsChanged: (listener) => configuration.onDidChange(listener),
    onDocumentChanged: (listener) =>
      toDisposer(
        vscode.workspace.onDidChangeTextDocument((event) => {
          if (event.contentChanges.length > 0 && isNote(event.document)) {
            listener(event.document.uri.toString(), event.document.getText());
          }
        }),
      ),
    onDocumentClosed: (listener) =>
      toDisposer(
        vscode.workspace.onDidCloseTextDocument((document) => {
          if (isNote(document)) {
            listener(document.uri.toString());
          }
        }),
      ),
    // The bundle runs from dist/, the worker is in dist/markdown/workers.
    createParser: () =>
      createVaultParser(workerPath(context.extensionUri, "vault")),
    hash: (text) => createHash("sha256").update(text).digest("hex"),
    warn: (message) => void vscode.window.showWarningMessage(message),
  };
}

function isNote(document: vscode.TextDocument): boolean {
  return document.uri.path.toLowerCase().endsWith(".md");
}

function toDisposer(disposable: vscode.Disposable): () => void {
  return () => disposable.dispose();
}

async function exists(uri: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.parse(uri));
    return true;
  } catch {
    return false;
  }
}

function vaultSettings(
  configuration: Configuration,
  root: string,
): VaultSettings {
  return {
    folderNote: configuration.get("links.folderNote", "", root),
    linkFormat: configuration.get("links.newLinkFormat", "shortest", root),
    excludedFiles: configuration.get<string[]>("vault.excludedFiles", [], root),
    rootMarkers: configuration.get("vault.rootMarkers", [".obsidian"], root),
  };
}

/** The vault path of a URI under a root, decoded (`My Note.md`). */
function relativePath(root: vscode.Uri, uri: vscode.Uri): string | undefined {
  const base = root.path.replace(/\/+$/, "") + "/";
  return uri.path.startsWith(base) ? uri.path.slice(base.length) : undefined;
}

/**
 * Walk the vault, skipping hidden folders, `node_modules` and symbolic links
 * to folders (which could loop), and stat each file.
 */
async function listVault(
  root: string,
  limit: number,
  shallow = false,
): Promise<{ files: ListedFile[]; partial: boolean }> {
  const base = vscode.Uri.parse(root);
  const uris = await collectFiles(base, limit + 1, shallow);
  const partial = uris.length > limit;
  const files = await statAll(base, uris.slice(0, limit));
  return { files, partial };
}

async function collectFiles(
  base: vscode.Uri,
  limit: number,
  shallow: boolean,
): Promise<vscode.Uri[]> {
  const files: vscode.Uri[] = [];
  const folders = [base];
  while (folders.length > 0 && files.length < limit) {
    const batch = folders.splice(0, STAT_CONCURRENCY);
    const listings = await Promise.all(batch.map(readDirectory));
    for (let i = 0; i < batch.length && files.length < limit; i++) {
      appendFolderEntries(base, batch[i]!, listings[i]!, {
        shallow,
        limit,
        files,
        folders,
      });
    }
  }
  return files;
}

function appendFolderEntries(
  base: vscode.Uri,
  folder: vscode.Uri,
  entries: readonly [string, vscode.FileType][],
  state: {
    shallow: boolean;
    limit: number;
    files: vscode.Uri[];
    folders: vscode.Uri[];
  },
): void {
  for (const [name, type] of entries) {
    if (state.files.length >= state.limit) {
      return;
    }
    const uri = vscode.Uri.joinPath(folder, name);
    const relPath = relativePath(base, uri);
    if (
      name.startsWith(".") ||
      name === "node_modules" ||
      (relPath !== undefined && isIgnoredPath(relPath))
    ) {
      continue;
    }
    const isLink = Boolean(type & vscode.FileType.SymbolicLink);
    if (type & vscode.FileType.Directory) {
      if (!state.shallow && !isLink) {
        state.folders.push(uri);
      }
    } else if (type & vscode.FileType.File) {
      state.files.push(uri);
    }
  }
}

async function readDirectory(
  folder: vscode.Uri,
): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(folder);
  } catch {
    return [];
  }
}

async function statAll(
  base: vscode.Uri,
  uris: vscode.Uri[],
): Promise<ListedFile[]> {
  const files: ListedFile[] = [];
  let next = 0;
  const worker = async () => {
    while (next < uris.length) {
      const file = await listedFile(base, uris[next++]!);
      if (file) {
        files.push(file);
      }
    }
  };
  await Promise.all(Array.from({ length: STAT_CONCURRENCY }, worker));
  return files;
}

async function listedFile(
  base: vscode.Uri,
  uri: vscode.Uri,
): Promise<ListedFile | undefined> {
  const path = relativePath(base, uri);
  if (path === undefined || isIgnoredPath(path)) {
    return undefined;
  }
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (!(stat.type & vscode.FileType.File)) {
      return undefined;
    }
    return { uri: uri.toString(), path, mtime: stat.mtime, size: stat.size };
  } catch {
    return undefined;
  }
}

/**
 * File events under a vault. VS Code reports a folder by itself when it is
 * created, deleted or renamed, so folder events expand to their files.
 */
function watchVault(
  root: string,
  listener: (event: FileEvent) => void,
): () => void {
  const base = vscode.Uri.parse(root);
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(base, "**/*"),
  );
  const created = async (uri: vscode.Uri, type: "create" | "change") => {
    for (const file of await filesAt(base, uri)) {
      listener({ type, file });
    }
  };
  const subscriptions = [
    watcher,
    watcher.onDidCreate((uri) => void created(uri, "create")),
    watcher.onDidChange((uri) => void created(uri, "change")),
    watcher.onDidDelete((uri) => {
      const path = relativePath(base, uri);
      if (path !== undefined) {
        listener({ type: "delete", path });
      }
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      for (const { oldUri, newUri } of event.files) {
        void renamed(base, oldUri, newUri, listener);
      }
    }),
  ];
  return () => {
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
  };
}

/** The files at a URI: the file itself, or every file in a folder. */
async function filesAt(
  base: vscode.Uri,
  uri: vscode.Uri,
): Promise<ListedFile[]> {
  const file = await listedFile(base, uri);
  if (file) {
    return [file];
  }
  const path = relativePath(base, uri);
  if (path === undefined || isIgnoredPath(path)) {
    return [];
  }
  return statAll(base, await collectFiles(uri, Infinity, false));
}

async function renamed(
  base: vscode.Uri,
  oldUri: vscode.Uri,
  newUri: vscode.Uri,
  listener: (event: FileEvent) => void,
): Promise<void> {
  const oldPath = relativePath(base, oldUri);
  const newPath = relativePath(base, newUri);
  if (oldPath === undefined || newPath === undefined) {
    return;
  }
  for (const file of await filesAt(base, newUri)) {
    const suffix = file.path.slice(newPath.length);
    listener({ type: "rename", oldPath: oldPath + suffix, file });
  }
}

/** A folder of JSON files per vault in the workspace's extension storage. */
function snapshotStore(
  storage: vscode.Uri | undefined,
  root: string,
): SnapshotStore | undefined {
  if (!storage) {
    return undefined;
  }
  const id = createHash("sha256").update(root).digest("hex").slice(0, 16);
  const folder = vscode.Uri.joinPath(storage, "vault-index", id);
  return {
    async read(name) {
      try {
        const file = vscode.Uri.joinPath(folder, `${name}.json`);
        return new TextDecoder().decode(
          await vscode.workspace.fs.readFile(file),
        );
      } catch {
        return undefined;
      }
    },
    async write(name, text) {
      // Write beside the file, then rename, so a crash never leaves half a file.
      const file = vscode.Uri.joinPath(folder, `${name}.json`);
      const temporary = vscode.Uri.joinPath(folder, `${name}.json.tmp`);
      await vscode.workspace.fs.createDirectory(folder);
      await vscode.workspace.fs.writeFile(
        temporary,
        new TextEncoder().encode(text),
      );
      await vscode.workspace.fs.rename(temporary, file, { overwrite: true });
    },
  };
}
