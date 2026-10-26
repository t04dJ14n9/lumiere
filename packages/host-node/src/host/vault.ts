/**
 * The vault plugin's file system outside VS Code, over the host's platform
 * (platform.ts), in place of VS Code's workspace API. Roots are the
 * workspaces the reader opened notes from.
 */
import type { Disposer } from "@workshop/core";
import {
  createVaultParser,
  isIgnoredPath,
  type FileEvent,
  type HostSettings,
  type ListedFile,
  type SnapshotStore,
  type VaultSystem,
} from "@workshop/markdown/portable";
import type { NoteDocuments } from "./documents";
import { containInRoots, type HostFiles, type HostPlatform } from "./platform";
import { joinUri } from "./uris";

/** Stats run this many at a time while listing a vault. */
const STAT_CONCURRENCY = 32;

export interface HostVaultOptions {
  readonly platform: HostPlatform;
  readonly documents: NoteDocuments;
  readonly settings: HostSettings;
  /** The workspace roots, as file URIs. */
  readonly roots: () => readonly string[];
  readonly warn: (message: string) => void;
}

export function createHostVaultSystem(options: HostVaultOptions): VaultSystem {
  const { platform, documents, settings, roots } = options;
  const { files } = platform;
  return {
    workspaceFolder: (uri) => roots().find((root) => files.isInside(root, uri)),
    workspaceFolders: roots,
    exists: async (uri) => {
      try {
        await containInRoots(files, roots(), uri);
      } catch {
        return false;
      }
      return (await files.stat(uri)) !== undefined;
    },
    list: (root, limit, shallow) => listVault(files, { root, limit, shallow }),
    read: async (uri) => {
      await containInRoots(files, roots(), uri);
      return files.readBytes(uri);
    },
    watch: (root, listener) => watchVault(files, root, listener),
    store: (root) => snapshotStore(platform, root),
    settings: (root) => ({
      folderNote: settings.get("links.folderNote", "", root),
      linkFormat: settings.get("links.newLinkFormat", "shortest", root),
      excludedFiles: settings.get<string[]>("vault.excludedFiles", [], root),
      rootMarkers: settings.get("vault.rootMarkers", [".obsidian"], root),
    }),
    onSettingsChanged: (listener) => settings.onChange(listener),
    onDocumentChanged: (listener) =>
      documents.onChange((document) => {
        if (/\.md$/i.test(document.uri)) {
          listener(document.uri, document.getText());
        }
      }),
    onDocumentClosed: (listener) => documents.onClosed(listener),
    createParser: () => createVaultParser(platform.workers),
    hash: (text) => platform.sha256(text),
    warn: options.warn,
  };
}

/** Every file under a root, outside hidden folders and `node_modules`, up to `limit`. */
export async function listVault(
  files: HostFiles,
  request: { root: string; limit: number; shallow?: boolean | undefined },
): Promise<{ files: ListedFile[]; partial: boolean }> {
  const { root, limit, shallow = false } = request;
  const found = await collectFiles(files, root, limit + 1, shallow);
  const listed = await statAll(files, found.slice(0, limit));
  return { files: listed, partial: found.length > limit };
}

/** Vault-relative paths (with `/`) of the files under `root`. */
async function collectFiles(
  files: HostFiles,
  root: string,
  limit: number,
  shallow: boolean,
): Promise<{ relative: string; uri: string }[]> {
  const found: { relative: string; uri: string }[] = [];
  const folders = [""];
  while (folders.length > 0 && found.length < limit) {
    const folder = folders.shift()!;
    const entries = await files.list(
      folder ? joinUri(files, root, folder) : root,
    );
    for (const entry of entries ?? []) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      const relative = folder ? `${folder}/${entry.name}` : entry.name;
      // A symbolic link ("other") could loop, so it is not entered.
      if (entry.kind === "folder" && !shallow) {
        folders.push(relative);
      } else if (entry.kind === "file") {
        found.push({ relative, uri: joinUri(files, root, relative) });
      }
    }
  }
  return found;
}

async function statAll(
  files: HostFiles,
  found: { relative: string; uri: string }[],
): Promise<ListedFile[]> {
  const listed: ListedFile[] = [];
  let next = 0;
  const worker = async () => {
    while (next < found.length) {
      const file = await listedFile(files, found[next++]!);
      if (file) {
        listed.push(file);
      }
    }
  };
  await Promise.all(Array.from({ length: STAT_CONCURRENCY }, worker));
  return listed;
}

async function listedFile(
  files: HostFiles,
  { relative, uri }: { relative: string; uri: string },
): Promise<ListedFile | undefined> {
  if (relative.startsWith("..") || isIgnoredPath(relative)) {
    return undefined;
  }
  const info = await files.stat(uri);
  if (info?.kind !== "file") {
    return undefined;
  }
  return { uri, path: relative, mtime: info.mtime, size: info.size };
}

/**
 * File events under a vault. A platform reports a path that changed, not
 * what happened to it, so a path that still exists is created or changed
 * and one that is gone was deleted; a rename arrives as a delete and a create.
 */
export function watchVault(
  files: HostFiles,
  root: string,
  listener: (event: FileEvent) => void,
): Disposer {
  const known = new Set<string>();
  return files.watchTree(root, (relative) => {
    void report({ files, root, relative, known, listener });
  });
}

async function report(change: {
  files: HostFiles;
  root: string;
  relative: string;
  known: Set<string>;
  listener: (event: FileEvent) => void;
}): Promise<void> {
  const { files, root, relative, known, listener } = change;
  if (isIgnoredPath(relative)) {
    return;
  }
  const uri = joinUri(files, root, relative);
  const file = await listedFile(files, { relative, uri });
  if (file) {
    listener({ type: known.has(relative) ? "change" : "create", file });
    known.add(relative);
    return;
  }
  known.delete(relative);
  if ((await files.stat(uri)) === undefined) {
    listener({ type: "delete", path: relative });
  }
}

/** A folder of JSON files per vault, in the host's store. */
function snapshotStore(platform: HostPlatform, root: string): SnapshotStore {
  const folder = `vault-index/${platform.sha256(root).slice(0, 16)}`;
  return {
    read: (name) => platform.store.read(`${folder}/${name}.json`),
    write: (name, text) => platform.store.write(`${folder}/${name}.json`, text),
  };
}
