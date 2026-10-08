import * as vscode from "vscode";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
  FileEvent,
  ListedFile,
  SnapshotStore,
  VaultSettings,
  VaultSystem,
} from "../plugins/vault/api";
import { isIgnoredPath } from "../plugins/vault/exclusion";
import { createVaultParser } from "./vault-parser";

/** Stats run this many at a time while listing a vault. */
const STAT_CONCURRENCY = 32;

/** The VS Code side of the vault plugin (DESIGN §12). */
export function createVaultSystem(
  context: vscode.ExtensionContext,
): VaultSystem {
  return {
    workspaceFolder: (uri) =>
      vscode.workspace
        .getWorkspaceFolder(vscode.Uri.parse(uri))
        ?.uri.toString(),
    exists,
    list: listVault,
    read: async (uri) => vscode.workspace.fs.readFile(vscode.Uri.parse(uri)),
    watch: watchVault,
    store: (root) => snapshotStore(context.storageUri, root),
    settings: vaultSettings,
    onSettingsChanged: (listener) =>
      toDisposer(
        vscode.workspace.onDidChangeConfiguration((event) => {
          const keys = ["vault", "links.folderNote", "links.newLinkFormat"];
          if (
            keys.some((key) =>
              event.affectsConfiguration(`markdownWorkbench.${key}`),
            )
          ) {
            listener();
          }
        }),
      ),
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
    createParser: () =>
      createVaultParser(join(__dirname, "workers", "vault.cjs")),
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

function vaultSettings(root: string): VaultSettings {
  const config = vscode.workspace.getConfiguration(
    "markdownWorkbench",
    vscode.Uri.parse(root),
  );
  return {
    folderNote: config.get<string>("links.folderNote", ""),
    linkFormat: config.get("links.newLinkFormat", "shortest"),
    excludedFiles: config.get<string[]>("vault.excludedFiles", []),
    rootMarkers: config.get<string[]>("vault.rootMarkers", [".obsidian"]),
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
    const folder = folders.shift()!;
    for (const [name, type] of await readDirectory(folder)) {
      if (name.startsWith(".") || name === "node_modules") {
        continue;
      }
      const uri = vscode.Uri.joinPath(folder, name);
      const isLink = Boolean(type & vscode.FileType.SymbolicLink);
      if (type & vscode.FileType.Directory) {
        if (!shallow && !isLink) {
          folders.push(uri);
        }
      } else if (type & vscode.FileType.File) {
        files.push(uri);
      }
    }
  }
  return files;
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

/** One JSON file per vault in the workspace's extension storage. */
function snapshotStore(
  storage: vscode.Uri | undefined,
  root: string,
): SnapshotStore | undefined {
  if (!storage) {
    return undefined;
  }
  const name = createHash("sha256").update(root).digest("hex").slice(0, 16);
  const folder = vscode.Uri.joinPath(storage, "vault-index");
  const file = vscode.Uri.joinPath(folder, `${name}.json`);
  return {
    async read() {
      try {
        return new TextDecoder().decode(
          await vscode.workspace.fs.readFile(file),
        );
      } catch {
        return undefined;
      }
    },
    async write(text) {
      // Write beside the file, then rename, so a crash never leaves half a snapshot.
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
