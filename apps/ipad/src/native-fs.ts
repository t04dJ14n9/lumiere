/**
 * A vault on the iPad (`VaultFileSystem`, host-web): the app's own folder or
 * one picked in Files, through the native plugin, which coordinates every
 * read and write with other apps and iCloud and reports their changes.
 */
import {
  notFound,
  type VaultFileInfo,
  type VaultFileSystem,
} from "@workshop/host-web";
import { isNotFound, vaultFiles } from "./native/vault-files";

export class NativeFileSystem implements VaultFileSystem {
  constructor(private readonly vault: string) {}

  async read(path: string): Promise<Uint8Array> {
    try {
      const { data } = await vaultFiles.read({
        vault: this.vault,
        path,
        encoding: "base64",
      });
      return fromBase64(data);
    } catch (error) {
      throw isNotFound(error) ? notFound(path) : error;
    }
  }

  async write(
    path: string,
    data: Uint8Array,
    mode: "replace" | "create",
  ): Promise<void> {
    const exists = (await this.stat(path)) !== undefined;
    if (mode === "create" && exists) {
      return;
    }
    if (mode === "replace" && !exists) {
      throw notFound(path);
    }
    await vaultFiles.write({
      vault: this.vault,
      path,
      data: toBase64(data),
      encoding: "base64",
    });
  }

  async stat(path: string): Promise<VaultFileInfo | undefined> {
    if (path === "") {
      return { kind: "folder", mtime: 0, size: 0 };
    }
    try {
      const { entry } = await vaultFiles.stat({ vault: this.vault, path });
      return entry
        ? { kind: entry.kind, mtime: entry.modified, size: entry.size }
        : undefined;
    } catch {
      return undefined;
    }
  }

  async list(path: string) {
    try {
      const { entries } = await vaultFiles.list({
        vault: this.vault,
        path,
        shallow: true,
      });
      return entries.map((entry) => ({
        name: entry.path.slice(entry.path.lastIndexOf("/") + 1),
        kind: entry.kind,
      }));
    } catch {
      return undefined;
    }
  }

  async mkdir(path: string): Promise<void> {
    if (path !== "") {
      await vaultFiles.createFolder({ vault: this.vault, path });
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await vaultFiles.remove({ vault: this.vault, path });
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  async move(from: string, to: string): Promise<void> {
    await vaultFiles.rename({ vault: this.vault, from, to });
  }

  watch(listener: (path: string) => void): () => void {
    const handle = vaultFiles.addListener("change", (change) => {
      if (change.vault === this.vault) {
        change.paths.forEach(listener);
      }
    });
    void vaultFiles.watch({ vault: this.vault });
    return () => void handle.then((listening) => listening.remove());
  }
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
