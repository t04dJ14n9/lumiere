import type { Disposer } from "../../kernel";
import type { Vaults } from "../vault/api";
import type { ConfigFiles } from "./config-files";
import type {
  ObsidianCompat,
  ObsidianOverrides,
  VaultConfigChange,
  VaultConfigScope,
  WirePropertyType,
} from "./api";
import { VaultConfig } from "./vault-config";
import { resolveConfigDirectory } from "./config-dir";

export interface VaultConfigsOptions {
  vaults: Pick<Vaults, "forDocument">;
  configFolder(vaultRoot: string): string;
  files(vaultRoot: string, directory: string): ConfigFiles;
  changed(change: VaultConfigChange): void;
  warn(message: string, error: unknown): void;
}
interface ConfigEntry {
  readonly folder: string;
  readonly ready: Promise<VaultConfig>;
  config?: VaultConfig;
}

/** Resolved roots key every cache, watcher and write queue, including profile changes. */
export class VaultConfigs implements ObsidianCompat {
  private readonly entries = new Map<string, ConfigEntry>();
  private readonly documentRoots = new Map<string, string>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly listeners = new Set<(change: VaultConfigChange) => void>();
  private isStopped = false;

  constructor(private readonly options: VaultConfigsOptions) {}

  async getPropertyTypes(scope: VaultConfigScope) {
    return (await this.resolve(scope)).types.types;
  }
  async setPropertyType(
    scope: VaultConfigScope,
    name: string,
    type: WirePropertyType | null,
  ): Promise<void> {
    const config = await this.resolve(scope);
    await config.types.set(name, type);
  }
  async getObsidianOverrides(
    scope: VaultConfigScope,
  ): Promise<ObsidianOverrides> {
    return (await this.resolve(scope)).overrides;
  }
  onDidChangeVaultConfig(
    listener: (change: VaultConfigChange) => void,
  ): Disposer {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Synchronous settings access uses only identities already resolved by core vault. */
  cachedOverrides(resource: string): ObsidianOverrides {
    const root = this.documentRoots.get(resource) ?? resource;
    const entry = this.entries.get(root);
    if (entry?.folder !== this.options.configFolder(root)) {
      return {};
    }
    return entry?.config?.overrides ?? {};
  }

  prepare(resource: string): Promise<void> {
    const pending = this.pending.get(resource);
    if (pending) {
      return pending;
    }
    const ready = this.resolve({ documentUri: resource }).then(() => {});
    this.pending.set(resource, ready);
    const forget = () => {
      this.pending.delete(resource);
    };
    void ready.then(forget, forget);
    return ready;
  }

  async reconfigure(): Promise<void> {
    for (const root of this.entries.keys()) {
      await this.configForRoot(root);
    }
  }

  async dispose(): Promise<void> {
    this.isStopped = true;
    await Promise.allSettled(this.pending.values());
    for (const entry of this.entries.values()) {
      const config = await entry.ready.catch(() => undefined);
      await config?.dispose();
    }
    this.entries.clear();
    this.documentRoots.clear();
    this.listeners.clear();
  }

  private async resolve(scope: VaultConfigScope): Promise<VaultConfig> {
    this.assertLive();
    const resource =
      "documentUri" in scope
        ? scope.documentUri
        : `${scope.vaultRoot.replace(/\/$/, "")}/`;
    const vault = await this.options.vaults.forDocument(resource);
    this.assertLive();
    const root = vault.index.root;
    if ("vaultRoot" in scope && root !== scope.vaultRoot) {
      throw new Error(
        "Obsidian configuration scope is not a resolved vault root.",
      );
    }
    const config = await this.configForRoot(root);
    this.assertLive();
    const previous = this.documentRoots.get(resource);
    this.documentRoots.set(resource, root);
    if (previous !== root) {
      this.changed(root);
    }
    return config;
  }

  private configForRoot(root: string): Promise<VaultConfig> {
    this.assertLive();
    const folder = this.options.configFolder(root);
    const directory = resolveConfigDirectory(root, folder);
    const previous = this.entries.get(root);
    if (previous?.folder === folder) {
      return previous.ready;
    }
    const entry: ConfigEntry = {
      folder,
      ready: this.openConfig({ root, directory, previous }).then((config) => {
        entry.config = config;
        this.changed(root);
        return config;
      }),
    };
    this.entries.set(root, entry);
    return entry.ready;
  }

  private async openConfig(options: {
    root: string;
    directory: string;
    previous: ConfigEntry | undefined;
  }): Promise<VaultConfig> {
    // Join the old profile's queue before a new writer for this vault starts.
    const previous = await options.previous?.ready.catch(() => undefined);
    await previous?.dispose();
    this.assertLive();
    const config = new VaultConfig({
      files: this.options.files(options.root, options.directory),
      changed: () => this.changed(options.root),
      warn: (message, error) =>
        this.options.warn(`${options.root}: ${message}`, error),
    });
    try {
      await config.start();
      return config;
    } catch (error) {
      await config.dispose();
      throw error;
    }
  }

  private changed(vaultRoot: string): void {
    if (this.isStopped) {
      return;
    }
    const change = { vaultRoot };
    this.options.changed(change);
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (error) {
        this.options.warn("Obsidian configuration listener failed.", error);
      }
    }
  }
  private assertLive(): void {
    if (this.isStopped) {
      throw new Error("Obsidian compatibility has stopped.");
    }
  }
}
