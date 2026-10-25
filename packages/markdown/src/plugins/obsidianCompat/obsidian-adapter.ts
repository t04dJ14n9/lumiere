import { normalizePath } from "./obsidian-core";
import { TFile, TFolder, type FileStats, type Vault } from "./obsidian-files";

export class DataAdapter {
  constructor(private readonly vault: Vault) {}

  getName(): string {
    return this.vault.getName();
  }

  async exists(normalizedPath: string): Promise<boolean> {
    const clean = normalizePath(normalizedPath);
    if (this.vault.getAbstractFileByPath(clean)) {
      return true;
    }
    return this.vault._checkBackendExists(clean);
  }

  async stat(
    normalizedPath: string,
  ): Promise<({ type: "file" | "folder" } & FileStats) | null> {
    const found = this.vault.getAbstractFileByPath(
      normalizePath(normalizedPath),
    );
    if (found instanceof TFile) {
      return { type: "file", ...found.stat };
    }
    if (found instanceof TFolder) {
      return { type: "folder", ctime: 0, mtime: 0, size: 0 };
    }
    return null;
  }

  async list(
    normalizedPath: string,
  ): Promise<{ files: string[]; folders: string[] }> {
    const clean = normalizePath(normalizedPath);
    const folder =
      clean === "" || clean === "/"
        ? this.vault.getRoot()
        : this.vault.getFolderByPath(clean);
    if (!folder) {
      return { files: [], folders: [] };
    }
    const files: string[] = [];
    const folders: string[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile) {
        files.push(child.path);
      } else if (child instanceof TFolder) {
        folders.push(child.path);
      }
    }
    return { files, folders };
  }

  async read(normalizedPath: string): Promise<string> {
    const clean = normalizePath(normalizedPath);
    const file = this.vault.getFileByPath(clean);
    return file ? this.vault.read(file) : this.vault._readFromBackend(clean);
  }

  async readBinary(normalizedPath: string): Promise<ArrayBuffer> {
    const text = await this.read(normalizedPath);
    return new TextEncoder().encode(text).buffer as ArrayBuffer;
  }

  async write(normalizedPath: string, data: string): Promise<void> {
    const clean = normalizePath(normalizedPath);
    const existing = this.vault.getFileByPath(clean);
    if (existing) {
      await this.vault.modify(existing, data);
    } else {
      await this.vault.create(clean, data);
    }
  }

  async writeBinary(normalizedPath: string, data: ArrayBuffer): Promise<void> {
    await this.write(
      normalizedPath,
      new TextDecoder("utf-8").decode(new Uint8Array(data)),
    );
  }

  async append(normalizedPath: string, data: string): Promise<void> {
    const current = await this.read(normalizedPath).catch(() => "");
    await this.write(normalizedPath, current + data);
  }

  async process(
    normalizedPath: string,
    fn: (data: string) => string,
  ): Promise<string> {
    const updated = fn(await this.read(normalizedPath));
    await this.write(normalizedPath, updated);
    return updated;
  }

  async mkdir(normalizedPath: string): Promise<void> {
    await this.vault.createFolder(normalizedPath);
  }

  async remove(normalizedPath: string): Promise<void> {
    const found = this.vault.getAbstractFileByPath(
      normalizePath(normalizedPath),
    );
    if (found) {
      await this.vault.delete(found, true);
    }
  }

  async rename(
    normalizedPath: string,
    normalizedNewPath: string,
  ): Promise<void> {
    const found = this.vault.getAbstractFileByPath(
      normalizePath(normalizedPath),
    );
    if (found) {
      await this.vault.rename(found, normalizedNewPath);
    }
  }

  async copy(normalizedPath: string, normalizedNewPath: string): Promise<void> {
    const file = this.vault.getFileByPath(normalizePath(normalizedPath));
    if (file) {
      await this.vault.copy(file, normalizedNewPath);
    }
  }

  getResourcePath(normalizedPath: string): string {
    return `app://local/${normalizePath(normalizedPath)}`;
  }
}

export class FileSystemAdapter extends DataAdapter {
  getBasePath(): string {
    return "";
  }
}
