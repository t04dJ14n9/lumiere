/**
 * What the shared host needs from the machine it runs on. Everything is
 * named by `file:` URIs, with `/` on every system; a platform turns them into
 * its own files: Node's file system (node-platform.ts), or a folder in a
 * browser or on an iPad (host-web). The rest of the host is written once,
 * against this, and must not import Node (test/unit/core-layers.test.ts).
 */
import type { WorkerLauncher } from "@workshop/markdown/portable";

export class OutsideWorkspace extends Error {
  constructor() {
    super("That path is outside the workspace");
    this.name = "OutsideWorkspace";
  }
}

export interface HostFileInfo {
  /** A symbolic link to a file or folder reports what it points at. */
  readonly kind: "file" | "folder" | "other";
  /** Milliseconds since the epoch. */
  readonly mtime: number;
  readonly size: number;
}

export interface HostEntry {
  readonly name: string;
  /** A symbolic link is "other": a listing never follows one. */
  readonly kind: "file" | "folder" | "other";
}

export interface HostFiles {
  /** Whether `uri` is `root` or inside it, once `..` and percent-encoding are resolved. */
  isInside(root: string, uri: string): boolean;
  /**
   * Rejects with `OutsideWorkspace` unless `uri` stays inside `root`, also
   * through symbolic links. A missing last part is allowed: a new note.
   */
  contain(root: string, uri: string): Promise<void>;
  /** Rejects with an error whose `code` is `FileNotFound` (or Node's `ENOENT`) when missing. */
  readText(uri: string): Promise<string>;
  readBytes(uri: string): Promise<Uint8Array>;
  /** Replace an existing file's text; a symbolic link in its place is not followed. */
  save(uri: string, text: string): Promise<void>;
  /**
   * Write a new, empty file. An existing file is left as it is, and a
   * symbolic link in its place is not followed.
   */
  create(uri: string): Promise<void>;
  /** The file or folder; undefined when there is none. */
  stat(uri: string): Promise<HostFileInfo | undefined>;
  /** `stat` of `uri` itself: a symbolic link's own time, not its target's. */
  linkStat(
    uri: string,
  ): Promise<{ mtime: number; symbolicLink: boolean } | undefined>;
  /** A folder's entries; undefined when it cannot be read. */
  list(uri: string): Promise<readonly HostEntry[] | undefined>;
  /** Make a folder and those above it. */
  mkdir(uri: string): Promise<void>;
  /** Copy a file, or a folder with everything in it. */
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  /** Remove one file (not a folder's contents); a missing one is not an error. */
  remove(uri: string): Promise<void>;
  /** Hear a file change, appear or go away; it and the folders above it need not exist yet. */
  watch(uri: string, listener: () => void): () => void;
  /** Hear changes anywhere under a folder: each changed path, relative to it, with `/`. */
  watchTree(uri: string, listener: (relative: string) => void): () => void;
  /** The path an embedder knows a file by (the app opens notes by path). */
  toPath(uri: string): string;
  /**
   * The URI of a path with `/` (`/C:/x` for a Windows drive), exactly as the
   * platform's own URIs are written, so that equal files have equal URIs.
   */
  uriOf(path: string): string;
  /**
   * Whether `uri` stays inside `root` once symbolic links are resolved
   * (`HostWorkspace.realContains`). A platform without links leaves it out.
   */
  realContains?(root: string, uri: string): Promise<boolean>;
}

/** The host's own small files (settings, state, vault snapshots), named with `/`. */
export interface HostStore {
  read(name: string): Promise<string | undefined>;
  /** Replace the whole file at once: a crash never leaves half of it. */
  write(name: string, text: string): Promise<void>;
}

export interface HostPlatform {
  readonly files: HostFiles;
  readonly store: HostStore;
  /** The vault parser's and search's workers. */
  readonly workers: WorkerLauncher;
  /** SHA-256 of the text's UTF-8 bytes, in hex. */
  sha256(text: string): string;
  /**
   * A passage for an agent chat, written outside every workspace; its URI.
   * The agent host's `writeScratchFile`.
   */
  writeScratchFile(name: string, text: string): Promise<string>;
}

/** Rejects unless `uri` is inside one of `roots`, also through symbolic links. */
export async function containInRoots(
  files: HostFiles,
  roots: readonly string[],
  uri: string,
): Promise<void> {
  const root = roots.find((item) => files.isInside(item, uri));
  if (!root) {
    throw new OutsideWorkspace();
  }
  await files.contain(root, uri);
}
