import { extensionOf, nameOf, stemOf } from "../../shared/vault-path";
import type { SerializedVaultFile } from "./api";
import { DataAdapter, FileSystemAdapter } from "./obsidian-adapter";
import { Events, normalizePath } from "./obsidian-core";

export { DataAdapter, FileSystemAdapter };

export interface FileStats {
  ctime: number;
  mtime: number;
  size: number;
}

export class TAbstractFile {
  vault: Vault;
  path: string;
  name: string;
  parent: TFolder | null = null;

  constructor(vault: Vault, path: string) {
    this.vault = vault;
    this.path = path;
    this.name = path === "" || path === "/" ? "" : nameOf(path);
  }
}

export class TFile extends TAbstractFile {
  stat: FileStats;
  basename: string;
  extension: string;

  constructor(vault: Vault, path: string, stat?: Partial<FileStats>) {
    super(vault, path);
    const now = Date.now();
    this.stat = {
      ctime: stat?.ctime ?? stat?.mtime ?? now,
      mtime: stat?.mtime ?? now,
      size: stat?.size ?? 0,
    };
    this.basename = stemOf(path);
    this.extension = extensionOf(path);
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];

  isRoot(): boolean {
    return this.path === "" || this.path === "/";
  }
}

export interface VaultBackend {
  read?(path: string): Promise<string>;
  modify?(path: string, data: string): Promise<{ mtime: number; size: number }>;
  create?(path: string, data: string): Promise<SerializedVaultFile>;
  createFolder?(path: string): Promise<void>;
  delete?(path: string): Promise<void>;
  rename?(path: string, newPath: string): Promise<void>;
  exists?(path: string): Promise<boolean>;
}

export class Vault extends Events {
  configDir = ".obsidian";
  adapter: DataAdapter;
  private vaultName = "vault";
  private readonly rootFolder: TFolder;
  private readonly entries = new Map<string, TAbstractFile>();
  private readonly contents = new Map<string, string>();
  private backend: VaultBackend;
  private onContentMutated?:
    ((file: TFile, content: string) => void) | undefined;

  constructor(
    backend: VaultBackend = {},
    onContentMutated?: (file: TFile, content: string) => void,
  ) {
    super();
    this.backend = backend;
    this.onContentMutated = onContentMutated;
    this.rootFolder = new TFolder(this, "/");
    this.entries.set("/", this.rootFolder);
    this.entries.set("", this.rootFolder);
    this.adapter = new FileSystemAdapter(this);
  }

  setBackend(
    backend: VaultBackend,
    onContentMutated?: (file: TFile, content: string) => void,
  ): void {
    this.backend = backend;
    if (onContentMutated) {
      this.onContentMutated = onContentMutated;
    }
  }

  setName(name: string): void {
    this.vaultName = name || "vault";
  }

  getName(): string {
    return this.vaultName;
  }

  getRoot(): TFolder {
    return this.rootFolder;
  }

  syncFiles(files: readonly SerializedVaultFile[]): void {
    const incomingPaths = new Set<string>();
    for (const item of files) {
      const clean = normalizePath(item.path);
      if (!clean || clean === "/") {
        continue;
      }
      incomingPaths.add(clean);
      const file = this.upsertFileEntry(clean, {
        mtime: item.mtime,
        ctime: item.ctime ?? item.mtime,
        size: item.size,
      });
      if (item.content !== undefined) {
        this.contents.set(clean, item.content);
        this.onContentMutated?.(file, item.content);
      }
    }
    for (const [path, entry] of [...this.entries.entries()]) {
      if (entry instanceof TFile && !incomingPaths.has(path)) {
        this.removeEntryFromTree(entry);
      }
    }
  }

  setCachedContent(path: string, content: string): TFile {
    const clean = normalizePath(path);
    const bytes = new TextEncoder().encode(content).byteLength;
    const file = this.upsertFileEntry(clean, {
      mtime: Date.now(),
      size: bytes,
    });
    this.contents.set(clean, content);
    this.onContentMutated?.(file, content);
    return file;
  }

  getCachedContent(path: string): string | undefined {
    return this.contents.get(normalizePath(path));
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    const clean = normalizePath(path);
    if (clean === "" || clean === "/") {
      return this.rootFolder;
    }
    return this.entries.get(clean) ?? null;
  }

  getFileByPath(path: string): TFile | null {
    const found = this.getAbstractFileByPath(path);
    return found instanceof TFile ? found : null;
  }

  getFolderByPath(path: string): TFolder | null {
    const found = this.getAbstractFileByPath(path);
    return found instanceof TFolder ? found : null;
  }

  getFiles(): TFile[] {
    return [...this.entries.values()].filter(
      (entry): entry is TFile => entry instanceof TFile,
    );
  }

  getMarkdownFiles(): TFile[] {
    return this.getFiles().filter(
      (file) => file.extension.toLowerCase() === "md",
    );
  }

  getAllLoadedFiles(): TAbstractFile[] {
    return [...new Set(this.entries.values())];
  }

  async read(file: TFile): Promise<string> {
    if (this.backend.read) {
      const content = await this.backend.read(file.path);
      this.contents.set(file.path, content);
      this.onContentMutated?.(file, content);
      return content;
    }
    return this.contents.get(file.path) ?? "";
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.contents.get(file.path) ?? this.read(file);
  }

  async readBinary(file: TFile): Promise<ArrayBuffer> {
    const text = await this.read(file);
    return new TextEncoder().encode(text).buffer as ArrayBuffer;
  }

  async modify(file: TFile, data: string): Promise<void> {
    const stat = this.backend.modify
      ? await this.backend.modify(file.path, data)
      : { mtime: Date.now(), size: new TextEncoder().encode(data).byteLength };
    file.stat.mtime = stat.mtime;
    file.stat.size = stat.size;
    this.contents.set(file.path, data);
    this.onContentMutated?.(file, data);
    this.trigger("modify", file);
  }

  async process(file: TFile, fn: (data: string) => string): Promise<string> {
    const updated = fn(await this.read(file));
    await this.modify(file, updated);
    return updated;
  }

  async append(file: TFile, data: string): Promise<void> {
    await this.modify(file, (await this.read(file)) + data);
  }

  async create(path: string, data: string): Promise<TFile> {
    const clean = normalizePath(path);
    if (!clean || clean === "/") {
      throw new Error("Invalid file path");
    }
    if (this.entries.has(clean)) {
      throw new Error(`File already exists: ${clean}`);
    }
    const created = this.backend.create
      ? await this.backend.create(clean, data)
      : {
          path: clean,
          mtime: Date.now(),
          size: new TextEncoder().encode(data).byteLength,
        };
    const file = this.upsertFileEntry(clean, created);
    this.contents.set(clean, data);
    this.onContentMutated?.(file, data);
    this.trigger("create", file);
    return file;
  }

  async createFolder(path: string): Promise<TFolder> {
    const clean = normalizePath(path);
    if (!clean || clean === "/") {
      return this.rootFolder;
    }
    const existing = this.entries.get(clean);
    if (existing) {
      if (existing instanceof TFolder) {
        return existing;
      }
      throw new Error(`File already exists at folder path: ${clean}`);
    }
    if (this.backend.createFolder) {
      await this.backend.createFolder(clean);
    }
    const folder = this.ensureFolderChain(clean);
    this.trigger("create", folder);
    return folder;
  }

  async delete(file: TAbstractFile, _force?: boolean): Promise<void> {
    if (this.backend.delete) {
      await this.backend.delete(file.path);
    }
    this.removeEntryFromTree(file);
    this.contents.delete(file.path);
    this.trigger("delete", file);
  }

  async trash(file: TAbstractFile, _system = false): Promise<void> {
    await this.delete(file, true);
  }

  async rename(file: TAbstractFile, newPath: string): Promise<void> {
    const cleanNew = normalizePath(newPath);
    const oldPath = file.path;
    if (this.backend.rename) {
      await this.backend.rename(oldPath, cleanNew);
    }
    this.removeEntryFromTree(file);
    const cached = this.contents.get(oldPath);
    this.contents.delete(oldPath);
    file.path = cleanNew;
    file.name = nameOf(cleanNew);
    if (file instanceof TFile) {
      file.basename = stemOf(cleanNew);
      file.extension = extensionOf(cleanNew);
    }
    const parent = this.parentFolderFor(cleanNew);
    file.parent = parent;
    parent.children.push(file);
    this.entries.set(cleanNew, file);
    if (cached !== undefined && file instanceof TFile) {
      this.contents.set(cleanNew, cached);
      this.onContentMutated?.(file, cached);
    }
    this.trigger("rename", file, oldPath);
  }

  async copy(file: TFile, newPath: string): Promise<TFile> {
    return this.create(newPath, await this.read(file));
  }

  async _readFromBackend(path: string): Promise<string> {
    if (this.backend.read) {
      return this.backend.read(path);
    }
    const cached = this.contents.get(path);
    if (cached !== undefined) {
      return cached;
    }
    throw new Error(`File not found: ${path}`);
  }

  async _checkBackendExists(path: string): Promise<boolean> {
    return this.backend.exists ? this.backend.exists(path) : false;
  }

  private upsertFileEntry(cleanPath: string, stat: Partial<FileStats>): TFile {
    const existing = this.entries.get(cleanPath);
    if (existing instanceof TFile) {
      if (stat.mtime !== undefined) {
        existing.stat.mtime = stat.mtime;
      }
      if (stat.size !== undefined) {
        existing.stat.size = stat.size;
      }
      return existing;
    }
    const file = new TFile(this, cleanPath, stat);
    const parent = this.parentFolderFor(cleanPath);
    file.parent = parent;
    if (!parent.children.includes(file)) {
      parent.children.push(file);
    }
    this.entries.set(cleanPath, file);
    return file;
  }

  private parentFolderFor(cleanPath: string): TFolder {
    const slash = cleanPath.lastIndexOf("/");
    return slash < 0
      ? this.rootFolder
      : this.ensureFolderChain(cleanPath.slice(0, slash));
  }

  private ensureFolderChain(folderPath: string): TFolder {
    const clean = normalizePath(folderPath);
    if (!clean || clean === "/") {
      return this.rootFolder;
    }
    const existing = this.entries.get(clean);
    if (existing instanceof TFolder) {
      return existing;
    }
    const parent = this.parentFolderFor(clean);
    const folder = new TFolder(this, clean);
    folder.parent = parent;
    parent.children.push(folder);
    this.entries.set(clean, folder);
    return folder;
  }

  private removeEntryFromTree(entry: TAbstractFile): void {
    this.entries.delete(entry.path);
    if (entry.parent) {
      const idx = entry.parent.children.indexOf(entry);
      if (idx >= 0) {
        entry.parent.children.splice(idx, 1);
      }
    }
    if (entry instanceof TFolder) {
      for (const child of [...entry.children]) {
        this.removeEntryFromTree(child);
      }
    }
  }
}
