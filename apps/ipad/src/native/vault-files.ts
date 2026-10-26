/**
 * The iPad's `LumiereVaultFiles` plugin (VaultFileSystemPlugin.swift), as the
 * window calls it: vaults (the app's own folder, folders picked in Files) and
 * their files, by vault id and a path inside it with "/". Swift checks every
 * path again; text travels as base64 here, whatever the file holds.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface NativeVault {
  readonly id: string;
  readonly name: string;
  readonly kind: "app" | "folder";
}

export interface NativeEntry {
  /** Inside the vault, with "/". */
  readonly path: string;
  readonly kind: "file" | "folder";
  readonly size: number;
  /** Milliseconds since 1970. */
  readonly modified: number;
}

interface VaultFilesPlugin {
  vaults(): Promise<{ vaults: NativeVault[] }>;
  pickFolder(): Promise<{ vault?: NativeVault; cancelled?: boolean }>;
  list(options: {
    vault: string;
    path: string;
    shallow?: boolean;
  }): Promise<{ entries: NativeEntry[] }>;
  stat(options: { vault: string; path: string }): Promise<{
    entry: NativeEntry | null;
  }>;
  read(options: {
    vault: string;
    path: string;
    encoding: "base64";
  }): Promise<{ data: string }>;
  write(options: {
    vault: string;
    path: string;
    data: string;
    encoding: "base64";
  }): Promise<{ entry: NativeEntry }>;
  createFolder(options: { vault: string; path: string }): Promise<void>;
  rename(options: { vault: string; from: string; to: string }): Promise<void>;
  remove(options: { vault: string; path: string }): Promise<void>;
  watch(options: { vault: string }): Promise<void>;
  addListener(
    event: "change",
    listener: (change: { vault: string; paths: string[] }) => void,
  ): Promise<PluginListenerHandle>;
}

export const vaultFiles = registerPlugin<VaultFilesPlugin>("LumiereVaultFiles");

/** Whether a call failed because the file is not there (Swift's `not-found`). */
export function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "not-found";
}
