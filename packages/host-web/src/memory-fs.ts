/** Files in memory (vault-fs.ts): a demo vault, the host's data in tests. */
import { notFound, type VaultFileSystem } from "./vault-fs";

type Entry =
  | { readonly kind: "file"; data: Uint8Array; mtime: number }
  | { readonly kind: "folder"; mtime: number };

export class MemoryFileSystem implements VaultFileSystem {
  private readonly entries = new Map<string, Entry>([
    ["", { kind: "folder", mtime: Date.now() }],
  ]);

  /** Files to start with, by path: text or bytes. */
  constructor(files: Readonly<Record<string, string | Uint8Array>> = {}) {
    for (const [path, content] of Object.entries(files)) {
      this.put(path, content);
    }
  }

  async read(path: string): Promise<Uint8Array> {
    const entry = this.entries.get(clean(path));
    if (entry?.kind !== "file") {
      throw notFound(path);
    }
    return entry.data.slice();
  }

  async write(
    path: string,
    data: Uint8Array,
    mode: "replace" | "create",
  ): Promise<void> {
    const key = clean(path);
    const entry = this.entries.get(key);
    if (mode === "create" && entry) {
      return;
    }
    if (mode === "replace" && entry?.kind !== "file") {
      throw notFound(path);
    }
    this.requireFolder(parentOf(key));
    this.entries.set(key, {
      kind: "file",
      data: data.slice(),
      mtime: Date.now(),
    });
  }

  async stat(path: string) {
    const entry = this.entries.get(clean(path));
    if (!entry) {
      return undefined;
    }
    const size = entry.kind === "file" ? entry.data.length : 0;
    return { kind: entry.kind, mtime: entry.mtime, size };
  }

  async list(path: string) {
    const key = clean(path);
    if (this.entries.get(key)?.kind !== "folder") {
      return undefined;
    }
    const prefix = key ? `${key}/` : "";
    return [...this.entries]
      .filter(([name]) => name.startsWith(prefix) && name !== key)
      .map(([name, entry]) => ({
        name: name.slice(prefix.length),
        kind: entry.kind,
      }))
      .filter(({ name }) => !name.includes("/"));
  }

  async mkdir(path: string): Promise<void> {
    let current = "";
    for (const part of clean(path).split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      const entry = this.entries.get(current);
      if (entry?.kind === "file") {
        throw new Error(`A file is in the way: ${current}`);
      }
      if (!entry) {
        this.entries.set(current, { kind: "folder", mtime: Date.now() });
      }
    }
  }

  async remove(path: string): Promise<void> {
    const key = clean(path);
    if ((await this.list(key))?.length) {
      throw new Error(`Folder not empty: ${path}`);
    }
    this.entries.delete(key);
  }

  async move(from: string, to: string): Promise<void> {
    const source = clean(from);
    const target = clean(to);
    if (!this.entries.has(source)) {
      throw notFound(from);
    }
    this.requireFolder(parentOf(target));
    for (const [name, entry] of [...this.entries]) {
      if (name === source || name.startsWith(`${source}/`)) {
        this.entries.delete(name);
        this.entries.set(target + name.slice(source.length), entry);
      }
    }
  }

  /** Synchronous setup, for files to start with. */
  put(path: string, content: string | Uint8Array): void {
    const key = clean(path);
    void this.mkdir(parentOf(key));
    const data =
      typeof content === "string" ? new TextEncoder().encode(content) : content;
    this.entries.set(key, { kind: "file", data, mtime: Date.now() });
  }

  private requireFolder(path: string): void {
    if (this.entries.get(path)?.kind !== "folder") {
      throw notFound(path);
    }
  }
}

function clean(path: string): string {
  return path.split("/").filter(Boolean).join("/");
}

function parentOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}
