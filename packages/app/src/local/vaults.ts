/**
 * The vaults the web or iPad window has open, and those opened before. A
 * vault is a folder mounted in host-web (`/vaults/<name>`); the embedder
 * mounts it, when the reader picks a folder or the app starts.
 */
import type { Mounts } from "@workshop/host-web";
import { listVault } from "@workshop/host-node/core";
import type { FileEntry, ServerEvent, VaultList } from "../shell/api";
import { fileKind } from "../shared/file-kind";
import type { TextFile } from "../shared/vault-trust";

/** A window lists at most this many of a vault's files. */
const MAX_FILES = 20_000;
const MAX_RECENT = 10;

export class LocalVaults {
  private readonly open = new Set<string>();
  private recent: string[] = [];

  constructor(
    private readonly mounts: Mounts,
    private readonly saved: TextFile,
    private readonly emit: (event: ServerEvent) => void,
  ) {}

  async load(): Promise<void> {
    try {
      const value: unknown = JSON.parse((await this.saved.read()) ?? "[]");
      this.recent = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      this.recent = [];
    }
  }

  list(): VaultList {
    return { open: [...this.open], recent: this.recent };
  }

  /** Open a mounted folder as a vault. */
  async add(path: string): Promise<string> {
    const info = await this.mounts.stat(this.mounts.uriOf(path));
    if (info?.kind !== "folder") {
      throw new Error(`Not a folder Lumière can open: ${path}`);
    }
    this.open.add(path);
    this.recent = [path, ...this.recent.filter((item) => item !== path)].slice(
      0,
      MAX_RECENT,
    );
    await this.saved.write(JSON.stringify(this.recent, null, 2));
    this.emit({ type: "vaults", open: [...this.open], added: path });
    return path;
  }

  async files(vault: string): Promise<readonly FileEntry[]> {
    if (!this.open.has(vault)) {
      throw new Error(`Not an open vault: ${vault}`);
    }
    const { files } = await listVault(this.mounts, {
      root: this.mounts.uriOf(vault),
      limit: MAX_FILES,
    });
    return files
      .map((file) => ({ path: file.path, kind: fileKind(file.path) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Show a note or folder by its path: a folder opens as a vault. */
  async show(target: string): Promise<void> {
    const info = await this.mounts.stat(this.mounts.uriOf(target));
    if (info?.kind === "folder") {
      await this.add(target);
      return;
    }
    const vault = [...this.open].find((item) => target.startsWith(`${item}/`));
    if (!vault) {
      throw new Error(`Not in an open vault: ${target}`);
    }
    this.emit({ type: "open", vault, path: target.slice(vault.length + 1) });
  }
}
