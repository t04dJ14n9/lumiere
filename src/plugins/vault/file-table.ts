import { extensionOf, lookupKey, stemOf } from "../../shared/vault-path";
import type { VaultFile } from "./api";

/** What the host knows about a file before the index adds derived fields. */
export interface FileEntry {
  uri: string;
  path: string;
  mtime: number;
  size: number;
  excluded?: boolean;
}

export function vaultFile(entry: FileEntry): VaultFile {
  return {
    ...entry,
    basename: stemOf(entry.path),
    extension: extensionOf(entry.path),
  };
}

/**
 * Every file in a vault by path, plus Obsidian's `uniqueFileLookup`: files
 * grouped by lower-case basename, which answers bare-name links without a
 * scan.
 */
export class FileTable {
  private readonly byPath = new Map<string, VaultFile>();
  private readonly byLowerPath = new Map<string, VaultFile>();
  private readonly byKey = new Map<string, VaultFile[]>();
  private sorted?: VaultFile[];

  get size(): number {
    return this.byPath.size;
  }

  all(): readonly VaultFile[] {
    this.sorted ??= [...this.byPath.values()].sort((a, b) =>
      a.path < b.path ? -1 : 1,
    );
    return this.sorted;
  }

  get(path: string): VaultFile | undefined {
    return this.byPath.get(path);
  }

  /** Links ignore case, as in Obsidian; an exact-case match wins. */
  find(path: string): VaultFile | undefined {
    return this.byPath.get(path) ?? this.byLowerPath.get(path.toLowerCase());
  }

  withKey(key: string): readonly VaultFile[] {
    return this.byKey.get(key) ?? [];
  }

  /** True when a folder at this path contains at least one file. */
  hasFolder(folder: string): boolean {
    const prefix = folder.toLowerCase() + "/";
    for (const path of this.byLowerPath.keys()) {
      if (path.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  set(file: VaultFile): void {
    this.delete(file.path);
    this.byPath.set(file.path, file);
    this.byLowerPath.set(file.path.toLowerCase(), file);
    const key = lookupKey(file.path);
    this.byKey.set(key, [...this.withKey(key), file]);
    this.sorted = undefined;
  }

  delete(path: string): VaultFile | undefined {
    const file = this.byPath.get(path);
    if (!file) {
      return undefined;
    }
    this.byPath.delete(path);
    if (this.byLowerPath.get(path.toLowerCase()) === file) {
      this.byLowerPath.delete(path.toLowerCase());
    }
    const key = lookupKey(path);
    const rest = this.withKey(key).filter((other) => other !== file);
    if (rest.length > 0) {
      this.byKey.set(key, rest);
    } else {
      this.byKey.delete(key);
    }
    this.sorted = undefined;
    return file;
  }
}
