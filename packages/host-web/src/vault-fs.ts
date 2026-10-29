/**
 * A folder of files a browser or an iPad can reach, by paths relative to it
 * with `/`: memory (memory-fs.ts), a folder handle (the File System Access
 * API, or the browser's private storage), or the iPad's own files through a
 * native plugin. Mounted under a vault root, it becomes the host's files
 * (mounts.ts). Paths given here are already inside it.
 */
export interface VaultFileInfo {
  readonly kind: "file" | "folder";
  /** Milliseconds since the epoch. */
  readonly mtime: number;
  readonly size: number;
}

export interface VaultFileSystem {
  /** Rejects with `FileNotFound` (vault-fs.ts `notFound`) when missing. */
  read(path: string): Promise<Uint8Array>;
  /**
   * A file as a Blob that is read only as far as it is used (a folder
   * handle's File), so a video's byte ranges need not read it all. Without
   * it, `Mounts.readBlob` reads the whole file.
   */
  readBlob?(path: string): Promise<Blob>;
  /** "replace" writes an existing file; "create" a new one, leaving one there as it is. */
  write(
    path: string,
    data: Uint8Array,
    mode: "replace" | "create",
  ): Promise<void>;
  stat(path: string): Promise<VaultFileInfo | undefined>;
  list(
    path: string,
  ): Promise<readonly { name: string; kind: "file" | "folder" }[] | undefined>;
  /** Make a folder and those above it. */
  mkdir(path: string): Promise<void>;
  /** Remove a file, or an empty folder; a missing one is not an error. */
  remove(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  /** Changes made from outside (another app, a sync), by path; none for memory. */
  watch?(listener: (path: string) => void): () => void;
}

/** The error a missing file rejects with, as VS Code's file system names it. */
export function notFound(path: string): Error {
  return Object.assign(new Error(`No file at ${path}`), {
    code: "FileNotFound",
  });
}
