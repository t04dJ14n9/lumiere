/**
 * VS Code's workspace services, over Node's file system: the DSH workspaces
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
  writeFile,
} from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DiagnosticSink,
  Extensions,
  HostWorkspace,
  WorkspaceFiles,
  WorkspaceStorage,
} from "@workshop/markdown/portable";

const toPath = (uri: string) => fileURLToPath(uri);

export function createHostWorkspace(
  roots: () => readonly string[],
): HostWorkspace {
  return {
    folders: roots,
    // DSH runs only what its owner installed and opened.
    isTrusted: () => true,
    read: async (uri) => readFile(toPath(uri)),
    stat: async (uri) => {
      const info = await lstat(toPath(uri));
      return { mtime: info.mtimeMs, symbolicLink: info.isSymbolicLink() };
    },
    watch: (uri, listener) => {
      const file = toPath(uri);
      const watcher = watch(path.dirname(file), (_event, name) => {
        if (name === null || name.toString() === path.basename(file)) {
          listener();
        }
      });
      watcher.on("error", () => watcher.close());
      return () => watcher.close();
    },
    files: createWorkspaceFiles(),
    diagnostics: noDiagnostics,
    revealTextEditor: async () => {},
  };
}

/** DSH shows no Problems list. */
const noDiagnostics: DiagnosticSink = {
  replaceAll: () => {},
  clear: () => {},
};

export function createWorkspaceFiles(): WorkspaceFiles {
  return {
    readText: async (uri) => {
      try {
        return await readFile(toPath(uri), "utf8");
      } catch {
        return undefined;
      }
    },
    writeText: async (uri, text) => {
      await mkdir(path.dirname(toPath(uri)), { recursive: true });
      await writeFile(toPath(uri), text, "utf8");
    },
    list: async (uri) => {
      try {
        return await readdir(toPath(uri));
      } catch {
        return undefined;
      }
    },
    mkdir: async (uri) => {
      await mkdir(toPath(uri), { recursive: true });
    },
    copy: async (from, to) => {
      await cp(toPath(from), toPath(to), { recursive: true });
    },
    move: async (from, to) => {
      await mkdir(path.dirname(toPath(to)), { recursive: true });
      await rename(toPath(from), toPath(to));
    },
    remove: async (uri) => {
      await rm(toPath(uri), { recursive: true, force: true });
    },
    isSymbolicLink: async (uri) => {
      try {
        return (await lstat(toPath(uri))).isSymbolicLink();
      } catch {
        return false;
      }
    },
    // There is no native file picker behind a browser page.
    pickFile: async () => undefined,
  };
}

/** Small state kept in one JSON file (VS Code's workspace state). */
export function createWorkspaceStorage(file: string): WorkspaceStorage {
  let values = readValues(file);
  return {
    get: <T>(key: string, fallback: T): T =>
      key in values ? (values[key] as T) : fallback,
    update: async (key, value) => {
      values = { ...values, [key]: value };
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(values));
    },
  };
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

/** No other extensions run beside Lumière in DSH. */
export function createExtensions(markdownDist: string): Extensions {
  return {
    isInstalled: () => false,
    workerPath: (name) => path.join(markdownDist, "workers", `${name}.cjs`),
  };
}
