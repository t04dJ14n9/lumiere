/**
 * The shared host's platform on Node (platform.ts): the file system, a data
 * folder for the host's own files, worker threads and node:crypto. The
 * safety rules live in paths.ts: containment through real paths, saves
 * that never follow a symbolic link, creation that never overwrites.
 */
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nodeWorkerLauncher, realContains } from "@workshop/markdown/node";
import {
  assertContained,
  createEmptyFile,
  fileUriToPath,
  isInside,
  writeAtomic,
  writeThroughFile,
} from "./paths";
import type { HostEntry, HostFiles, HostPlatform, HostStore } from "./platform";
import { fileUri } from "./uris";
import { listVault } from "./vault";
import { watchFile } from "./watch";

export interface NodePlatformOptions {
  /** Where settings, state and vault snapshots are kept. */
  readonly data: string;
  /** The built workers (`markdown/workers`). */
  readonly workers: string;
}

export function createNodePlatform(options: NodePlatformOptions): HostPlatform {
  return {
    files: nodeFiles,
    store: folderStore(options.data),
    workers: nodeWorkerLauncher(options.workers),
    sha256: (text) => createHash("sha256").update(text).digest("hex"),
    async writeScratchFile(name, text) {
      const folder = path.join(options.data, "agent");
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const file = path.join(folder, path.basename(name));
      await writeFile(file, text, { mode: 0o600 });
      return pathToFileURL(file).toString();
    },
  };
}

/** A file, a folder, or anything else (a symbolic link in a listing, a socket). */
function kindOf(entry: {
  isFile(): boolean;
  isDirectory(): boolean;
}): HostEntry["kind"] {
  if (entry.isFile()) {
    return "file";
  }
  return entry.isDirectory() ? "folder" : "other";
}

/** A `file:` URI's path; throws for any other URI, as Node's own calls would. */
function toFile(uri: string): string {
  const file = fileUriToPath(uri);
  if (file === undefined) {
    throw new Error(`Not a file URI: ${uri}`);
  }
  return file;
}

export const nodeFiles: HostFiles = {
  isInside,
  contain: assertContained,
  readText: (uri) => readFile(toFile(uri), "utf8"),
  readBytes: (uri) => readFile(toFile(uri)),
  save: (uri, text) => writeThroughFile(toFile(uri), text),
  create: (uri) => createEmptyFile(toFile(uri)),
  async stat(uri) {
    try {
      const info = await stat(toFile(uri));
      return { kind: kindOf(info), mtime: info.mtimeMs, size: info.size };
    } catch {
      return undefined;
    }
  },
  async linkStat(uri) {
    try {
      const info = await lstat(toFile(uri));
      return { mtime: info.mtimeMs, symbolicLink: info.isSymbolicLink() };
    } catch {
      return undefined;
    }
  },
  async list(uri) {
    try {
      const entries = await readdir(toFile(uri), { withFileTypes: true });
      return entries.map((entry): HostEntry => ({
        name: entry.name,
        kind: kindOf(entry),
      }));
    } catch {
      return undefined;
    }
  },
  mkdir: async (uri) => {
    await mkdir(toFile(uri), { recursive: true });
  },
  copy: (from, to) => cp(toFile(from), toFile(to), { recursive: true }),
  move: (from, to) => rename(toFile(from), toFile(to)),
  // A file, not a tree: VS Code's workspace fs deletes one entry.
  remove: (uri) => rm(toFile(uri), { recursive: false, force: true }),
  watch: (uri, listener) => watchFile(toFile(uri), listener),
  watchTree,
  toPath: (uri) => fileURLToPath(uri),
  // Through this runtime's own pathToFileURL, whatever it encodes.
  uriOf: (file) => pathToFileURL(fileURLToPath(fileUri(file))).href,
  realContains,
};

/**
 * Node reports the path that changed under a folder. macOS also reports the
 * watched folder itself, by its own name, which is dropped.
 */
function watchTree(uri: string, listener: (relative: string) => void) {
  const base = toFile(uri);
  const watcher = watch(base, { recursive: true }, (_event, name) => {
    if (name !== null && name.toString() !== path.basename(base)) {
      listener(name.toString().split(path.sep).join("/"));
    }
  });
  watcher.on("error", () => watcher.close());
  return () => watcher.close();
}

/** The host's own files, in a folder. */
function folderStore(folder: string): HostStore {
  return {
    async read(name) {
      try {
        return await readFile(path.join(folder, name), "utf8");
      } catch {
        return undefined;
      }
    },
    write: (name, text) => writeAtomic(path.join(folder, name), text),
  };
}

/** Every file under a vault root (vault.ts `listVault`), on Node's file system. */
export function listNodeVault(root: string, limit: number, shallow = false) {
  return listVault(nodeFiles, { root, limit, shallow });
}
