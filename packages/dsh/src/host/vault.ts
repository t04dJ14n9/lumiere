/**
 * The vault plugin's file system in DSH: Node's, in place of VS Code's
 * workspace API. Roots are the DSH workspaces the reader opened notes from.
 */
import { createHash } from "node:crypto";
import { watch, type Dirent } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
import { isInside, pathInsideRoots } from "./paths";

export { isInside } from "./paths";

/** Stats run this many at a time while listing a vault. */
const STAT_CONCURRENCY = 32;

export interface NodeVaultOptions {
  readonly documents: NoteDocuments;
  readonly settings: HostSettings;
  /** The DSH workspace roots, as file URIs. */
  readonly roots: () => readonly string[];
  /** Where vault snapshots are kept between sessions. */
  readonly storage: string;
  /** The built parser worker (`markdown/workers/vault.cjs`). */
  readonly parserWorker: string;
  readonly warn: (message: string) => void;
}

export function createNodeVaultSystem(options: NodeVaultOptions): VaultSystem {
  const { documents, settings, roots } = options;
  return {
    workspaceFolder: (uri) => roots().find((root) => isInside(root, uri)),
    workspaceFolders: roots,
    exists: async (uri) => {
      try {
        await stat(await pathInsideRoots(roots(), uri));
        return true;
      } catch {
        return false;
      }
    },
    list: listVault,
    read: async (uri) => readFile(await pathInsideRoots(roots(), uri)),
    watch: watchVault,
    store: (root) => snapshotStore(options.storage, root),
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
    createParser: () => createVaultParser(options.parserWorker),
    hash: (text) => createHash("sha256").update(text).digest("hex"),
    warn: options.warn,
  };
}

/** Every file under a root, outside hidden folders and `node_modules`, up to `limit`. */
export async function listVault(
  root: string,
  limit: number,
  shallow = false,
): Promise<{ files: ListedFile[]; partial: boolean }> {
  const base = fileURLToPath(root);
  const found = await collectFiles(base, limit + 1, shallow);
  const files = await statAll(base, found.slice(0, limit));
  return { files, partial: found.length > limit };
}

async function collectFiles(
  base: string,
  limit: number,
  shallow: boolean,
): Promise<string[]> {
  const files: string[] = [];
  const folders = [base];
  while (folders.length > 0 && files.length < limit) {
    const folder = folders.shift()!;
    for (const entry of await entries(folder)) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      const full = path.join(folder, entry.name);
      // A symbolic link to a folder could loop, so it is not entered.
      if (entry.isDirectory() && !shallow) {
        folders.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

async function entries(folder: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function statAll(base: string, files: string[]): Promise<ListedFile[]> {
  const listed: ListedFile[] = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = await listedFile(base, files[next++]!);
      if (file) {
        listed.push(file);
      }
    }
  };
  await Promise.all(Array.from({ length: STAT_CONCURRENCY }, worker));
  return listed;
}

async function listedFile(
  base: string,
  file: string,
): Promise<ListedFile | undefined> {
  const relative = path.relative(base, file).split(path.sep).join("/");
  if (relative.startsWith("..") || isIgnoredPath(relative)) {
    return undefined;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) {
      return undefined;
    }
    return {
      uri: pathToFileURL(file).toString(),
      path: relative,
      mtime: info.mtimeMs,
      size: info.size,
    };
  } catch {
    return undefined;
  }
}

/**
 * File events under a vault. Node reports a path that changed, not what
 * happened to it, so a path that still exists is created or changed and one
 * that is gone was deleted; a rename arrives as a delete and a create.
 */
export function watchVault(
  root: string,
  listener: (event: FileEvent) => void,
): Disposer {
  const base = fileURLToPath(root);
  const known = new Set<string>();
  const watcher = watch(base, { recursive: true }, (_event, name) => {
    // macOS also reports the watched folder itself, by its own name.
    if (name !== null && name.toString() !== path.basename(base)) {
      void report(base, name.toString(), known, listener);
    }
  });
  watcher.on("error", () => watcher.close());
  return () => watcher.close();
}

async function report(
  base: string,
  name: string,
  known: Set<string>,
  listener: (event: FileEvent) => void,
): Promise<void> {
  const relative = name.split(path.sep).join("/");
  if (isIgnoredPath(relative)) {
    return;
  }
  const file = await listedFile(base, path.join(base, name));
  if (file) {
    listener({ type: known.has(relative) ? "change" : "create", file });
    known.add(relative);
    return;
  }
  known.delete(relative);
  try {
    await stat(path.join(base, name));
  } catch {
    listener({ type: "delete", path: relative });
  }
}

/** A folder of JSON files per vault, in the plugin's data folder. */
function snapshotStore(storage: string, root: string): SnapshotStore {
  const id = createHash("sha256").update(root).digest("hex").slice(0, 16);
  const folder = path.join(storage, "vault-index", id);
  return {
    async read(name) {
      try {
        return await readFile(path.join(folder, `${name}.json`), "utf8");
      } catch {
        return undefined;
      }
    },
    async write(name, text) {
      // Write beside the file, then rename, so a crash never leaves half a file.
      const file = path.join(folder, `${name}.json`);
      await mkdir(folder, { recursive: true });
      await writeFile(`${file}.tmp`, text);
      await rename(`${file}.tmp`, file);
    },
  };
}
