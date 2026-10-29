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
  const slash = entry.path.lastIndexOf("/");
  const name = slash < 0 ? entry.path : entry.path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1) : "";
  const basename = dot > 0 ? name.slice(0, dot) : name;
  return {
    ...entry,
    basename,
    extension,
  };
}

function fileLookupKey(file: VaultFile): string {
  const ext = file.extension;
  if (ext === "md" || ext === "markdown" || /^(?:md|markdown)$/i.test(ext)) {
    return file.basename.toLowerCase();
  }
  return (ext ? `${file.basename}.${ext}` : file.basename).toLowerCase();
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

  /** Every path, unsorted; cheaper than `all()` when order does not matter. */
  paths(): string[] {
    return [...this.byPath.keys()];
  }

  get(path: string): VaultFile | undefined {
    return this.byPath.get(path);
  }

  /** Links ignore case, as in Obsidian; an exact-case match wins. */
  find(path: string): VaultFile | undefined {
    return this.byPath.get(path) ?? this.byLowerPath.get(path.toLowerCase());
  }

  withKey(key: string): readonly VaultFile[] {
    return this.byKey.get(key) ?? EMPTY_FILES;
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
    const key = fileLookupKey(file);
    const list = this.byKey.get(key);
    if (list) {
      list.push(file);
    } else {
      this.byKey.set(key, [file]);
    }
    delete this.sorted;
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
    const key = fileLookupKey(file);
    const rest = this.withKey(key).filter((other) => other !== file);
    if (rest.length > 0) {
      this.byKey.set(key, rest);
    } else {
      this.byKey.delete(key);
    }
    delete this.sorted;
    return file;
  }
}

const EMPTY_FILES: readonly VaultFile[] = [];
