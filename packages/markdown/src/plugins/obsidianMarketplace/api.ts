import type { Disposer } from "@workshop/core";
import type { CommunityPluginBundle } from "../obsidianCompat/api";

export interface CatalogPluginEntry {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly repo: string;
  readonly downloads: number;
}

export interface MarketplacePluginEntry extends CatalogPluginEntry {
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly installedVersion?: string;
}

export interface MarketplaceCatalogSnapshot {
  readonly trusted: boolean;
  readonly configDir: string;
  readonly items: readonly MarketplacePluginEntry[];
}

export interface MarketplaceMutationResult {
  readonly trusted: boolean;
  readonly configDir: string;
  readonly enabledIds: readonly string[];
  readonly item?: MarketplacePluginEntry;
  readonly items: readonly MarketplacePluginEntry[];
  readonly plugins: readonly CommunityPluginBundle[];
}

export interface ObsidianMarketplace {
  fetchCatalog(forceRefresh?: boolean): Promise<readonly CatalogPluginEntry[]>;
  listCatalog(
    vaultRoot: string,
    configFolder?: string,
    forceRefresh?: boolean,
  ): Promise<MarketplaceCatalogSnapshot>;
  installPlugin(
    vaultRoot: string,
    configFolder: string | undefined,
    id: string,
    repo?: string,
  ): Promise<MarketplaceMutationResult>;
  setPluginEnabled(
    vaultRoot: string,
    configFolder: string | undefined,
    id: string,
    enabled: boolean,
  ): Promise<MarketplaceMutationResult>;
  uninstallPlugin(
    vaultRoot: string,
    configFolder: string | undefined,
    id: string,
  ): Promise<MarketplaceMutationResult>;
  onDidChangePlugins(listener: (vaultRoot: string) => void): Disposer;
}

declare module "@workshop/core" {
  interface Services {
    obsidianMarketplace: ObsidianMarketplace;
  }
  interface Events {
    /** @mode emit */ "obsidianMarketplace/changed": (change: {
      readonly vaultRoot: string;
    }) => void;
  }
}
