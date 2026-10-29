/**
 * The host's files (`HostFiles`, from `@workshop/host-node/core`) over the
 * folders mounted in it: each vault root, and the host's own data, is a
 * `VaultFileSystem` at an absolute path such as `/vaults/Notes`. URIs are
 * `file:` URIs over those paths. There are no symbolic links here, so
 * containment is lexical. Every write through here is reported to watchers;
 * a folder's own `watch` reports changes made from outside.
 */
import {
  fileUri,
  OutsideWorkspace,
  uriPath,
  type HostEntry,
  type HostFileInfo,
  type HostFiles,
} from "@workshop/host-node/core";
import { notFound, type VaultFileSystem } from "./vault-fs";

interface Resolved {
  readonly fs: VaultFileSystem;
  /** Inside the mount, with `/`, "" for its root. */
  readonly path: string;
  /** The absolute path. */
  readonly full: string;
}

export class Mounts implements HostFiles {
  private readonly mounts = new Map<string, VaultFileSystem>();
  private readonly fileWatchers = new Map<string, Set<() => void>>();
  private readonly treeWatchers = new Map<
    string,
    Set<(relative: string) => void>
  >();

  /** Mount `fs` at an absolute path (`/vaults/Notes`); returns the way to unmount it. */
  mount(root: string, fs: VaultFileSystem): () => void {
    const at = normalize(root);
    if (at === "/") {
      throw new Error("A folder cannot be mounted over everything");
    }
    this.mounts.set(at, fs);
    const stop = fs.watch?.((path) => this.changed(join(at, path)));
    return () => {
      stop?.();
      if (this.mounts.get(at) === fs) {
        this.mounts.delete(at);
      }
    };
  }

  /** The URI of a mount's root (or of a path in it). */
  uriOf(path: string): string {
    return fileUri(path);
  }

  toPath(uri: string): string {
    return uriPath(uri);
  }

  isInside(root: string, uri: string): boolean {
    try {
      const base = normalize(uriPath(root));
      const target = normalize(uriPath(uri));
      return target === base || target.startsWith(`${base}/`);
    } catch {
      return false;
    }
  }

  async contain(root: string, uri: string): Promise<void> {
    if (!this.isInside(root, uri)) {
      throw new OutsideWorkspace();
    }
  }

  async readText(uri: string): Promise<string> {
    return new TextDecoder().decode(await this.readBytes(uri));
  }

  async readBytes(uri: string): Promise<Uint8Array> {
    const { fs, path } = this.resolve(uri);
    return fs.read(path);
  }

  /** A file as a Blob: read as it is used where its folder can, else whole. */
  async readBlob(uri: string): Promise<Blob> {
    const { fs, path } = this.resolve(uri);
    if (fs.readBlob) {
      return fs.readBlob(path);
    }
    // read() gives a copy of its own, on a plain ArrayBuffer.
    return new Blob([(await fs.read(path)) as Uint8Array<ArrayBuffer>]);
  }

  async save(uri: string, text: string): Promise<void> {
    const { fs, path, full } = this.resolve(uri);
    await fs.write(path, new TextEncoder().encode(text), "replace");
    this.changed(full);
  }

  async create(uri: string): Promise<void> {
    const { fs, path, full } = this.resolve(uri);
    await fs.write(path, new Uint8Array(), "create");
    this.changed(full);
  }

  async stat(uri: string): Promise<HostFileInfo | undefined> {
    const found = this.find(uri);
    return found ? found.fs.stat(found.path) : undefined;
  }

  async linkStat(uri: string) {
    const info = await this.stat(uri);
    return info ? { mtime: info.mtime, symbolicLink: false } : undefined;
  }

  async list(uri: string): Promise<readonly HostEntry[] | undefined> {
    const found = this.find(uri);
    return found ? found.fs.list(found.path) : undefined;
  }

  async mkdir(uri: string): Promise<void> {
    const { fs, path, full } = this.resolve(uri);
    await fs.mkdir(path);
    this.changed(full);
  }

  async copy(from: string, to: string): Promise<void> {
    const source = this.resolve(from);
    const target = this.resolve(to);
    await copyTree(source, target);
    this.changed(target.full);
  }

  async move(from: string, to: string): Promise<void> {
    const source = this.resolve(from);
    const target = this.resolve(to);
    if (source.fs === target.fs) {
      await source.fs.move(source.path, target.path);
    } else {
      await copyTree(source, target);
      await source.fs.remove(source.path);
    }
    this.changed(source.full);
    this.changed(target.full);
  }

  async remove(uri: string): Promise<void> {
    const { fs, path, full } = this.resolve(uri);
    await fs.remove(path);
    this.changed(full);
  }

  watch(uri: string, listener: () => void): () => void {
    return listen(this.fileWatchers, normalize(uriPath(uri)), listener);
  }

  watchTree(uri: string, listener: (relative: string) => void): () => void {
    return listen(this.treeWatchers, normalize(uriPath(uri)), listener);
  }

  /** A file changed at `full`: tell whoever watches it, or a folder above it. */
  private changed(full: string): void {
    for (const listener of this.fileWatchers.get(full) ?? []) {
      listener();
    }
    for (const [root, listeners] of this.treeWatchers) {
      if (full.startsWith(`${root}/`)) {
        for (const listener of listeners) {
          listener(full.slice(root.length + 1));
        }
      }
    }
  }

  private resolve(uri: string): Resolved {
    const found = this.find(uri);
    if (!found) {
      throw notFound(uri);
    }
    return found;
  }

  /** The mount `uri` is in: the longest root it is inside. */
  private find(uri: string): Resolved | undefined {
    let full: string;
    try {
      full = normalize(uriPath(uri));
    } catch {
      return undefined;
    }
    let best: string | undefined;
    for (const root of this.mounts.keys()) {
      const inside = full === root || full.startsWith(`${root}/`);
      if (inside && (!best || root.length > best.length)) {
        best = root;
      }
    }
    if (best === undefined) {
      return undefined;
    }
    return {
      fs: this.mounts.get(best)!,
      path: full.slice(best.length + 1),
      full,
    };
  }
}

/** A file, or a folder and everything in it, from one mount to another. */
async function copyTree(source: Resolved, target: Resolved): Promise<void> {
  const info = await source.fs.stat(source.path);
  if (!info) {
    throw notFound(source.full);
  }
  if (info.kind === "file") {
    const data = await source.fs.read(source.path);
    await target.fs.write(target.path, data, "create");
    return;
  }
  await target.fs.mkdir(target.path);
  for (const entry of (await source.fs.list(source.path)) ?? []) {
    await copyTree(child(source, entry.name), child(target, entry.name));
  }
}

function child(parent: Resolved, name: string): Resolved {
  return {
    fs: parent.fs,
    path: parent.path ? `${parent.path}/${name}` : name,
    full: `${parent.full}/${name}`,
  };
}

function listen<T>(
  watchers: Map<string, Set<T>>,
  key: string,
  listener: T,
): () => void {
  const listeners = watchers.get(key) ?? new Set<T>();
  watchers.set(key, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      watchers.delete(key);
    }
  };
}

function normalize(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function join(root: string, path: string): string {
  return path ? `${root}/${path}` : root;
}
