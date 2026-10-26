/**
 * A vault in a folder the browser gives a handle to (`VaultFileSystem`): one
 * the reader picked (the File System Access API), or the browser's private
 * storage (the Origin Private File System). Neither reports changes made
 * from outside, so a picked folder's other changes show on the next listing.
 */
import {
  notFound,
  type VaultFileInfo,
  type VaultFileSystem,
} from "@workshop/host-web";

export class HandleFileSystem implements VaultFileSystem {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  async read(path: string): Promise<Uint8Array> {
    const file = await this.file(path);
    return new Uint8Array(await (await file.getFile()).arrayBuffer());
  }

  async write(
    path: string,
    data: Uint8Array,
    mode: "replace" | "create",
  ): Promise<void> {
    const { folder, name } = await this.parent(path);
    const exists = await folder.getFileHandle(name).then(
      () => true,
      () => false,
    );
    if (mode === "create" && exists) {
      return;
    }
    if (mode === "replace" && !exists) {
      throw notFound(path);
    }
    const handle = await folder.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data as Uint8Array<ArrayBuffer>);
    await writable.close();
  }

  async stat(path: string): Promise<VaultFileInfo | undefined> {
    const parts = split(path);
    if (parts.length === 0) {
      return { kind: "folder", mtime: 0, size: 0 };
    }
    try {
      const { folder, name } = await this.parent(path);
      const file = await folder.getFileHandle(name).then(
        (handle) => handle.getFile(),
        () => undefined,
      );
      if (file) {
        return { kind: "file", mtime: file.lastModified, size: file.size };
      }
      await folder.getDirectoryHandle(name);
      return { kind: "folder", mtime: 0, size: 0 };
    } catch {
      return undefined;
    }
  }

  async list(path: string) {
    let folder: FileSystemDirectoryHandle;
    try {
      folder = await this.folder(split(path));
    } catch {
      return undefined;
    }
    const entries: { name: string; kind: "file" | "folder" }[] = [];
    for await (const [name, handle] of folder.entries()) {
      entries.push({
        name,
        kind: handle.kind === "file" ? "file" : "folder",
      });
    }
    return entries;
  }

  async mkdir(path: string): Promise<void> {
    await this.folder(split(path), true);
  }

  async remove(path: string): Promise<void> {
    try {
      const { folder, name } = await this.parent(path);
      await folder.removeEntry(name);
    } catch (error) {
      if ((error as DOMException).name !== "NotFoundError") {
        throw error;
      }
    }
  }

  async move(from: string, to: string): Promise<void> {
    const info = await this.stat(from);
    if (info?.kind !== "file") {
      throw new Error("Only files can be moved in a browser folder");
    }
    if (await this.stat(to)) {
      throw new Error(`Something is already at ${to}`);
    }
    await this.write(to, await this.read(from), "create");
    await this.remove(from);
  }

  private async file(path: string): Promise<FileSystemFileHandle> {
    try {
      const { folder, name } = await this.parent(path);
      return await folder.getFileHandle(name);
    } catch {
      throw notFound(path);
    }
  }

  private async parent(
    path: string,
  ): Promise<{ folder: FileSystemDirectoryHandle; name: string }> {
    const parts = split(path);
    const name = parts.pop();
    if (!name) {
      throw notFound(path);
    }
    return { folder: await this.folder(parts), name };
  }

  private async folder(
    parts: readonly string[],
    create = false,
  ): Promise<FileSystemDirectoryHandle> {
    let folder = this.root;
    for (const part of parts) {
      folder = await folder.getDirectoryHandle(part, { create });
    }
    return folder;
  }
}

function split(path: string): string[] {
  return path.split("/").filter(Boolean);
}
