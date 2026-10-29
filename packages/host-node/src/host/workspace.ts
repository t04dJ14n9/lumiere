/**
 * VS Code's workspace services outside VS Code, over the host's platform
 * (platform.ts): the workspaces notes were opened from, file operations, and
 * small persistent state. Every path is checked against the roots first.
 */
import type {
  DiagnosticSink,
  Extensions,
  HostWorkspace,
  WorkerLauncher,
  WorkspaceFiles,
  WorkspaceStorage,
} from "@workshop/markdown/portable";
import { containInRoots, type HostFiles, type HostStore } from "./platform";
import { parentUri } from "./uris";

/** VS Code's workspace state, in the host's store. */
export const STATE_FILE = "state.json";

export interface HostWorkspaceOptions {
  readonly files: HostFiles;
  /** The workspace roots, as file URIs. */
  readonly roots: () => readonly string[];
}

export function createHostWorkspace({
  files,
  roots,
}: HostWorkspaceOptions): HostWorkspace {
  const inside = (uri: string) => containInRoots(files, roots(), uri);
  return {
    folders: roots,
    // The host runs only what its owner installed and opened.
    isTrusted: () => true,
    read: async (uri) => {
      await inside(uri);
      return files.readBytes(uri);
    },
    stat: async (uri) => {
      await inside(uri);
      const info = await files.linkStat(uri);
      if (!info) {
        throw Object.assign(new Error(`No file at ${uri}`), {
          code: "FileNotFound",
        });
      }
      return info;
    },
    ...(files.realContains
      ? {
          realContains: (root: string, uri: string) =>
            files.realContains!(root, uri),
        }
      : {}),
    watch: (uri, listener) => watchContained(inside, files, uri, listener),
    files: createWorkspaceFiles(files, roots),
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
  files: HostFiles,
  roots: () => readonly string[],
): WorkspaceFiles {
  const inside = (uri: string) => containInRoots(files, roots(), uri);
  return {
    authorize: (root, target) => files.contain(root, target),
    readText: async (uri) => {
      try {
        await inside(uri);
        return await files.readText(uri);
      } catch {
        return undefined;
      }
    },
    writeText: async (uri, text) => {
      await inside(uri);
      await files.mkdir(parentUri(files, uri));
      // `save` only replaces a file (host-web refuses a missing one), and
      // `create` leaves an existing one as it is.
      await files.create(uri);
      await files.save(uri, text);
    },
    list: async (uri) => {
      try {
        await inside(uri);
      } catch {
        return undefined;
      }
      return (await files.list(uri))?.map((entry) => entry.name);
    },
    mkdir: async (uri) => {
      await inside(uri);
      await files.mkdir(uri);
    },
    copy: async (from, to) => {
      await Promise.all([inside(from), inside(to)]);
      await files.copy(from, to);
    },
    move: async (from, to) => {
      await Promise.all([inside(from), inside(to)]);
      await files.mkdir(parentUri(files, to));
      await files.move(from, to);
    },
    remove: async (uri) => {
      await inside(uri);
      await files.remove(uri);
    },
    isSymbolicLink: async (uri) => {
      try {
        await inside(uri);
      } catch {
        return false;
      }
      return (await files.linkStat(uri))?.symbolicLink ?? false;
    },
    // There is no native file picker behind a page.
    pickFile: async () => undefined,
  };
}

/**
 * Small state kept in one JSON file (VS Code's workspace state). `saved` is
 * what the store held at start (`STATE_FILE`).
 */
export function createWorkspaceStorage(
  store: HostStore,
  saved: string | undefined,
): WorkspaceStorage {
  let values = readValues(saved);
  let writing: Promise<void> = Promise.resolve();
  return {
    get: <T>(key: string, fallback: T): T =>
      key in values ? (values[key] as T) : fallback,
    update: (key, value) => {
      const job = writing.then(async () => {
        values = { ...values, [key]: value };
        await store.write(STATE_FILE, JSON.stringify(values));
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
  inside: (uri: string) => Promise<void>,
  files: HostFiles,
  uri: string,
  listener: () => void,
): () => void {
  let close = (): void => {};
  let stopped = false;
  void inside(uri)
    .then(() => {
      if (stopped) {
        return;
      }
      // The file, or folders above it, may not exist yet.
      close = files.watch(uri, listener);
    })
    .catch(() => {
      // Outside the workspace, or gone: there is nothing to watch.
    });
  return () => {
    stopped = true;
    close();
  };
}

function readValues(text: string | undefined): Record<string, unknown> {
  if (text === undefined) {
    return {};
  }
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** No other extensions run beside Lumière outside VS Code. */
export function createExtensions(workers: WorkerLauncher): Extensions {
  return { isInstalled: () => false, workers };
}
