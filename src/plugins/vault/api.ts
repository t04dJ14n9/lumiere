import type { Disposer } from "../../kernel";
import type { NoteMetadata } from "../../markdown/metadata";
export interface VaultFile {
  path: string;
  basename: string;
  extension: string;
  mtime: number;
  size: number;
  uri: string;
  /**
   * Matched by `markdownWorkbench.vault.excludedFiles`. As in Obsidian, an
   * excluded file is still indexed and links to it resolve, but quick switcher,
   * suggestions, search and unlinked mentions leave it out.
   */
  excluded?: boolean;
}
export type VaultChange =
  | { type: "create" | "modify" | "delete"; path: string }
  | { type: "rename"; path: string; oldPath: string };
export interface Backlink {
  path: string;
  count: number;
}
export interface VaultIndex {
  readonly root: string;
  files(): readonly VaultFile[];
  file(path: string): VaultFile | undefined;
  metadata(path: string): NoteMetadata | undefined;
  resolveLink(linktext: string, sourcePath: string): VaultFile | undefined;
  resolveLinkCandidates(
    linktext: string,
    sourcePath: string,
  ): readonly VaultFile[];
  linkText(target: VaultFile, sourcePath: string): string;
  resolvedLinks(sourcePath: string): ReadonlyMap<string, number>;
  unresolvedLinks(sourcePath: string): ReadonlyMap<string, number>;
  backlinks(targetPath: string): readonly Backlink[];
  tags(): ReadonlyMap<string, number>;
  onDidChange(listener: (change: VaultChange) => void): Disposer;
  onDidResolve(listener: () => void): Disposer;
}
/** A file as the host lists it, relative to the vault root. */
export interface ListedFile {
  uri: string;
  path: string;
  mtime: number;
  size: number;
}
export type FileEvent =
  | { type: "create" | "change"; file: ListedFile }
  | { type: "delete"; path: string }
  | { type: "rename"; oldPath: string; file: ListedFile };
/** What the indexer needs from the file system, so tests can use memory. */
export interface VaultFileSystem {
  /** Files under the root outside ignored folders, up to `limit`; only the root's own files when `shallow`. */
  list(
    root: string,
    limit: number,
    shallow?: boolean,
  ): Promise<{ files: ListedFile[]; partial: boolean }>;
  read(uri: string): Promise<Uint8Array>;
  /** File events under the root; created and changed files carry fresh stats. */
  watch(root: string, listener: (event: FileEvent) => void): Disposer;
}
/** Where one vault's snapshot is kept between sessions. */
export interface SnapshotStore {
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
}
/** Parses note text, in the indexing worker in the extension. */
export type NoteParser = (text: string) => Promise<NoteMetadata>;
export interface VaultSettings {
  folderNote: string;
  linkFormat: "shortest" | "relative" | "absolute";
  excludedFiles: readonly string[];
  rootMarkers: readonly string[];
}
/**
 * The VS Code side of the vault plugin, provided by the bootstrap so that
 * the plugin itself stays testable without VS Code.
 */
export interface VaultSystem extends VaultFileSystem {
  /** The workspace folder containing this URI, if any. */
  workspaceFolder(uri: string): string | undefined;
  workspaceFolders(): readonly string[];
  exists(uri: string): Promise<boolean>;
  /** Persistent storage for a vault's snapshot; absent without a workspace. */
  store(root: string): SnapshotStore | undefined;
  settings(root: string): VaultSettings;
  onSettingsChanged(listener: () => void): Disposer;
  /** A text document's unsaved text changed, or the document closed. */
  onDocumentChanged(listener: (uri: string, text: string) => void): Disposer;
  onDocumentClosed(listener: (uri: string) => void): Disposer;
  createParser(): { parse: NoteParser; dispose(): void };
  hash(text: string): string;
  warn(message: string): void;
}
/** One vault: its index and the operations that need the whole vault. */
export interface Vault {
  readonly index: VaultIndex;
  /** Resolves when indexing has caught up with the file system. */
  settled(): Promise<void>;
  /** The vault path of a URI inside this vault, or `undefined`. */
  pathOf(uri: string): string | undefined;
}
export interface Vaults {
  /** The vault that contains a note, indexed on first use (DESIGN §12.1). */
  forDocument(uri: string): Promise<Vault>;
  /** The vault of each workspace folder, for commands with no note open. */
  forWorkspace(): Promise<Vault | undefined>;
  /** A URI's vault and vault path, or `undefined` outside the workspace. */
  locate(uri: string): Promise<{ vault: Vault; path: string } | undefined>;
  /** A note's current text: unsaved text while it is open, else the file. */
  text(uri: string): Promise<string>;
  /**
   * Open a vault file in the editor, at an offset in its current text when
   * given (for example a heading or a link found in that text).
   */
  open(
    uri: string,
    options?: { offset?: number; side?: boolean },
  ): Promise<void>;
  all(): readonly Vault[];
}
declare module "../../kernel/types" {
  interface Services {
    vault: VaultIndex;
    vaults: Vaults;
    vaultSystem: VaultSystem;
  }
  interface Events {
    /** @mode emit */ "vault/changed": (
      root: string,
      change: VaultChange,
    ) => void;
    /** @mode emit */ "vault/resolved": (root: string) => void;
  }
}
