/**
 * VS Code's workspace services, over Node's file system: the workspaces
 * notes were opened from, file operations, and small persistent state.
 */
import { readFileSync, watch } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import * as path from "node:path";
import type {
  DiagnosticSink,
  Extensions,
  HostWorkspace,
  WorkspaceFiles,
  WorkspaceStorage,
} from "@workshop/markdown/portable";
import {
  assertContained,
  pathInsideRoots,
  writeAtomic,
  writeThroughFile,
} from "./paths";

export function createHostWorkspace(
  roots: () => readonly string[],
): HostWorkspace {
  return {
    folders: roots,
    // The host runs only what its owner installed and opened.
    isTrusted: () => true,
    read: async (uri) => readFile(await pathInsideRoots(roots(), uri)),
    stat: async (uri) => {
      const info = await lstat(await pathInsideRoots(roots(), uri));
      return { mtime: info.mtimeMs, symbolicLink: info.isSymbolicLink() };
    },
    watch: (uri, listener) => watchContained(roots, uri, listener),
    files: createWorkspaceFiles(roots),
    diagnostics: noDiagnostics,
    revealTextEditor: async () => {},
  };
}

/** No Problems list outside VS Code. */
const noDiagnostics: DiagnosticSink = {
  replaceAll: () => {},
  clear: () => {},
};

export function createWorkspaceFiles(
  roots: () => readonly string[],
): WorkspaceFiles {
  const inside = (uri: string) => pathInsideRoots(roots(), uri);
  return {
    authorize: (root, target) => assertContained(root, target),
    readText: (uri) => textInside(inside, uri),
    writeText: async (uri, text) => {
      const file = await inside(uri);
      await mkdir(path.dirname(file), { recursive: true });
      await writeThroughFile(file, text);
    },
    list: (uri) => namesInside(inside, uri),
    mkdir: async (uri) => {
      await mkdir(await inside(uri), { recursive: true });
    },
    copy: async (from, to) => {
      await cp(await inside(from), await inside(to), { recursive: true });
    },
    move: async (from, to) => {
      const target = await inside(to);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(await inside(from), target);
    },
    remove: async (uri) => {
      // A file, not a tree: VS Code's workspace fs deletes one entry.
      await rm(await inside(uri), { recursive: false, force: true });
    },
    isSymbolicLink: (uri) => linkInside(inside, uri),
    // There is no native file picker behind a browser page.
    pickFile: async () => undefined,
  };
}

/** Small state kept in one JSON file (VS Code's workspace state). */
export function createWorkspaceStorage(file: string): WorkspaceStorage {
  let values = readValues(file);
  let writing: Promise<void> = Promise.resolve();
  return {
    get: <T>(key: string, fallback: T): T =>
      key in values ? (values[key] as T) : fallback,
    update: (key, value) => {
      const job = writing.then(async () => {
        values = { ...values, [key]: value };
        await writeAtomic(file, JSON.stringify(values));
      });
      writing = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
    },
  };
}

/** Watch a file only after it is known to sit inside a workspace. */
function watchContained(
  roots: () => readonly string[],
  uri: string,
  listener: () => void,
): () => void {
  let close = (): void => {};
  let stopped = false;
  void pathInsideRoots(roots(), uri)
    .then((file) => {
      if (stopped) {
        return;
      }
      const watcher = watch(path.dirname(file), (_event, name) => {
        if (name === null || name.toString() === path.basename(file)) {
          listener();
        }
      });
      watcher.on("error", () => watcher.close());
      close = () => watcher.close();
    })
    .catch(() => {
      // Outside the workspace, or gone: there is nothing to watch.
    });
  return () => {
    stopped = true;
    close();
  };
}

async function textInside(
  inside: (uri: string) => Promise<string>,
  uri: string,
): Promise<string | undefined> {
  try {
    return await readFile(await inside(uri), "utf8");
  } catch {
    return undefined;
  }
}

async function namesInside(
  inside: (uri: string) => Promise<string>,
  uri: string,
): Promise<readonly string[] | undefined> {
  try {
    return await readdir(await inside(uri));
  } catch {
    return undefined;
  }
}

async function linkInside(
  inside: (uri: string) => Promise<string>,
  uri: string,
): Promise<boolean> {
  try {
    return (await lstat(await inside(uri))).isSymbolicLink();
  } catch {
    return false;
  }
}

function readValues(file: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** No other extensions run beside Lumière outside VS Code. */
export function createExtensions(markdownDist: string): Extensions {
  return {
    isInstalled: () => false,
    workerPath: (name) => path.join(markdownDist, "workers", `${name}.cjs`),
  };
}
