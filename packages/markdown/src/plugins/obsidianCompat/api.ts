import type { Disposer } from "@workshop/core";

/** Serialized Obsidian types, distinct from editable UI kinds. */
export type WirePropertyType =
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "multitext"
  | "tags"
  | "aliases";
export type VaultConfigScope =
  { readonly vaultRoot: string } | { readonly documentUri: string };
export type PropertyTypes = Readonly<Record<string, WirePropertyType | string>>;
export type ObsidianOverrides = Readonly<Partial<Record<string, unknown>>>;
export interface VaultConfigChange {
  readonly vaultRoot: string;
}

export interface ObsidianPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly minAppVersion?: string;
  readonly description?: string;
  readonly author?: string;
  readonly authorUrl?: string;
  readonly isDesktopOnly?: boolean;
  readonly dir?: string;
}

export interface CommunityPluginBundle {
  readonly id: string;
  readonly manifest: ObsidianPluginManifest;
  readonly mainJs: string;
  readonly stylesCss?: string;
  readonly data?: unknown;
}

export interface SerializedVaultFile {
  readonly path: string;
  readonly mtime: number;
  readonly ctime?: number;
  readonly size: number;
  readonly content?: string;
}

export interface ObsidianBootstrapSnapshot {
  readonly trusted: boolean;
  readonly vaultRoot: string;
  readonly vaultName: string;
  readonly configDir: string;
  readonly activePath: string;
  readonly files: readonly SerializedVaultFile[];
  readonly plugins: readonly CommunityPluginBundle[];
}

export interface ObsidianCompat {
  /** Resolves the supplied identity before returning an immutable snapshot. */
  getPropertyTypes(scope: VaultConfigScope): Promise<PropertyTypes>;
  /** Rejects on hosts without atomic conditional writes; their registry is read-only. */
  setPropertyType(
    scope: VaultConfigScope,
    name: string,
    type: WirePropertyType | null,
  ): Promise<void>;
  /** Candidates; effective settings additionally honor explicit VS Code layers. */
  getObsidianOverrides(scope: VaultConfigScope): Promise<ObsidianOverrides>;
  onDidChangeVaultConfig(
    listener: (change: VaultConfigChange) => void,
  ): Disposer;
}

declare module "@workshop/core" {
  interface Services {
    obsidianCompat: ObsidianCompat;
  }
  interface Events {
    /** @mode emit */ "obsidianCompat/changed": (
      change: VaultConfigChange,
    ) => void;
  }
}
