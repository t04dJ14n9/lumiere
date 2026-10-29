/**
 * The vaults the app has open (folders of notes), the ones opened before,
 * and what is in each, for the shell's file tree.
 */
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { listVault } from "@workshop/host-node";
import { fileKind } from "../shared/file-kind";

/** Files listed per vault; a larger vault's tree is cut short. */
const MAX_FILES = 20_000;
const MAX_RECENT = 12;

export interface FileEntry {
  /** Relative to the vault, with `/`. */
  readonly path: string;
  readonly kind: "note" | "pdf" | "image" | "other";
}

export type VaultEvent =
  /** The open vaults changed; `added` is the one just opened. */
  | {
      readonly type: "vaults";
      readonly open: readonly string[];
      readonly added?: string;
    }
  | { readonly type: "open"; readonly vault: string; readonly path: string };

export class Vaults {
  private readonly open = new Set<string>();
  private recent: string[] = [];
  private readonly listeners = new Set<(event: VaultEvent) => void>();

  /** `file`: where the recently opened vaults are remembered. */
  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const saved: unknown = JSON.parse(await readFile(this.file, "utf8"));
      this.recent = Array.isArray(saved)
        ? saved.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      this.recent = [];
    }
  }

  list(): { open: readonly string[]; recent: readonly string[] } {
    return { open: [...this.open], recent: this.recent };
  }

  /** Open a folder as a vault; it must be an existing absolute directory. */
  async add(folder: string): Promise<string> {
    // By its real path: host-node opens notes by theirs, so a vault reached
    // through a symlink must be known by where it really is.
    const vault = await realPath(folder);
    if (!path.isAbsolute(folder) || !vault || !(await isDirectory(vault))) {
      throw new Error(`Not a folder: ${folder}`);
    }
    if (!this.open.has(vault)) {
      this.open.add(vault);
      this.emit({ type: "vaults", open: [...this.open], added: vault });
    }
    await this.remember(vault);
    return vault;
  }

  /** Close an open vault; it stays in the recent list. */
  async close(folder: string): Promise<void> {
    const vault = (await realPath(folder)) ?? path.resolve(folder);
    if (this.open.delete(vault) || this.open.delete(folder)) {
      this.emit({ type: "vaults", open: [...this.open] });
    }
  }

  /**
   * Show a note or folder: a folder opens as a vault; a file opens in the
   * open vault that holds it, or with its own folder as a new vault.
   */
  async show(target: string): Promise<void> {
    const resolved = (await realPath(target)) ?? path.resolve(target);
    if (await isDirectory(resolved)) {
      await this.add(resolved);
      return;
    }
    const kind = fileKind(resolved);
    if (kind !== "note" && kind !== "pdf") {
      throw new Error(`Not a note: ${target}`);
    }
    const vault =
      this.holding(resolved) ?? (await this.add(path.dirname(resolved)));
    this.emit({
      type: "open",
      vault,
      path: path.relative(vault, resolved).split(path.sep).join("/"),
    });
  }

  /** The open vault a path is in, if any. */
  holding(target: string): string | undefined {
    return [...this.open].find(
      (vault) => target === vault || target.startsWith(vault + path.sep),
    );
  }

  async files(vault: string): Promise<readonly FileEntry[]> {
    if (!this.open.has(vault)) {
      throw new Error(`Not an open vault: ${vault}`);
    }
    const { files } = await listVault(
      pathToFileURL(vault).toString(),
      MAX_FILES,
    );
    return files
      .map((file) => ({ path: file.path, kind: fileKind(file.path) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  onEvent(listener: (event: VaultEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: VaultEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private async remember(vault: string): Promise<void> {
    this.recent = [
      vault,
      ...this.recent.filter((item) => item !== vault),
    ].slice(0, MAX_RECENT);
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.recent, null, 2));
  }
}

async function realPath(target: string): Promise<string | undefined> {
  return realpath(path.resolve(target)).catch(() => undefined);
}

async function isDirectory(target: string): Promise<boolean> {
  return (await stat(target).catch(() => undefined))?.isDirectory() ?? false;
}
