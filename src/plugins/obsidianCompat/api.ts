import type { Disposer } from "../../kernel";

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

declare module "../../kernel/types" {
  interface Services {
    obsidianCompat: ObsidianCompat;
  }
  interface Events {
    /** @mode emit */ "obsidianCompat/changed": (
      change: VaultConfigChange,
    ) => void;
  }
}
