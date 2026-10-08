import { SourceCoordinates } from "../../shared/document/coordinates";
import type { Navigation } from "../../shared/runtime";
import { isMarkdownPath } from "../../shared/vault-path";
import type { Vault, VaultChange, Vaults, VaultSystem } from "./api";
import { VaultIndexer } from "./indexer";
import { MemoryVaultIndex } from "./memory-index";
import { findVaultRoot, foldersUpTo } from "./roots";

export interface RegistryEvents {
  changed(root: string, change: VaultChange): void;
  resolved(root: string): void;
  error(message: string, error: unknown): void;
}

/**
 * One index per vault, shared by every editor panel and view in the window.
 * A vault is indexed the first time a note in it is opened and stays indexed
 * for the session, as in Obsidian.
 */
export class VaultRegistry implements Vaults {
  /** Vaults by root, available once their file list is known. */
  private readonly ready = new Map<string, Promise<IndexedVault>>();
  /** Vaults by root from the moment indexing starts, for routing open documents. */
  private readonly opened = new Map<string, IndexedVault>();
  private parser?: ReturnType<VaultSystem["createParser"]>;
  /** The latest text of each open note, kept without the indexing delay. */
  private readonly openTexts = new Map<string, string>();

  constructor(
    private readonly system: VaultSystem,
    private readonly events: RegistryEvents,
    private readonly navigation?: Navigation,
  ) {}

  async forDocument(uri: string): Promise<Vault> {
    const workspace = this.system.workspaceFolder(uri);
    if (!workspace) {
      return this.looseVault(uri);
    }
    const root = await this.findRoot(uri, workspace);
    let vault = this.ready.get(root);
    if (!vault) {
      vault = this.openVault(root);
      this.ready.set(root, vault);
    }
    return vault;
  }

  async forWorkspace(): Promise<Vault | undefined> {
    const folder = this.system.workspaceFolders()[0];
    // A note at the folder's root finds the folder's own vault.
    return folder ? this.forDocument(`${folder}/`) : undefined;
  }

  async locate(
    uri: string,
  ): Promise<{ vault: Vault; path: string } | undefined> {
    if (!this.system.workspaceFolder(uri)) {
      return undefined;
    }
    const vault = await this.forDocument(uri);
    const path = vault.pathOf(uri);
    return path === undefined ? undefined : { vault, path };
  }

  async text(uri: string): Promise<string> {
    const open = this.openTexts.get(uri);
    if (open !== undefined) {
      return open;
    }
    return new TextDecoder().decode(await this.system.read(uri));
  }

  async open(
    uri: string,
    options: { offset?: number; side?: boolean } = {},
  ): Promise<void> {
    const located = await this.locate(uri);
    if (!located || !this.navigation) {
      return;
    }
    // The editor counts line breaks as one character; the file may use CRLF.
    const at =
      options.offset === undefined
        ? undefined
        : new SourceCoordinates(await this.text(uri)).toEditor(options.offset);
    await this.navigation.open(
      located.vault.index.root,
      uri,
      "",
      options.side ?? false,
      at,
    );
  }

  all(): readonly Vault[] {
    return [...this.opened.values()];
  }

  /** An open note's unsaved text replaces its file on disk in the index. */
  setOverlay(uri: string, text: string): void {
    this.openTexts.set(uri, text);
    const owner = this.owner(uri);
    if (owner && isMarkdownPath(owner.path)) {
      owner.vault.indexer.setOverlay(owner.path, text);
    }
  }

  clearOverlay(uri: string): void {
    this.openTexts.delete(uri);
    const owner = this.owner(uri);
    owner?.vault.indexer.clearOverlay(owner.path);
  }

  applySettings(): void {
    for (const vault of this.opened.values()) {
      vault.indexer.applySettings();
    }
  }

  async dispose(): Promise<void> {
    const vaults = [...this.opened.values()];
    this.ready.clear();
    this.opened.clear();
    await Promise.all(vaults.map((vault) => vault.indexer.dispose()));
    this.parser?.dispose();
  }

  private async findRoot(uri: string, workspace: string): Promise<string> {
    const markers = this.system.settings(workspace).rootMarkers;
    const folders = foldersUpTo(uri, workspace);
    const hasMarker = async (folder: string) => {
      for (const marker of markers) {
        if (await this.system.exists(`${folder}/${marker}`)) {
          return true;
        }
      }
      return false;
    };
    return (await findVaultRoot(folders, hasMarker)) ?? workspace;
  }

  private async openVault(root: string): Promise<IndexedVault> {
    this.parser ??= this.system.createParser();
    const indexer = new VaultIndexer({
      root,
      fs: this.system,
      store: this.system.store(root),
      parse: this.parser.parse,
      hash: (text) => this.system.hash(text),
      settings: () => this.system.settings(root),
      onResolved: () => this.events.resolved(root),
      onPartial: () =>
        this.system.warn(
          `This vault has more than 50,000 files. Markdown Workbench indexes the first 50,000.`,
        ),
      onError: (message, error) => this.events.error(message, error),
    });
    indexer.index.onDidChange((change) => this.events.changed(root, change));
    const vault = new IndexedVault(root, indexer);
    this.opened.set(root, vault);
    await indexer.ready;
    return vault;
  }

  /**
   * A note outside every workspace folder is a vault of its own folder: no
   * index or watching, only the files beside it, so relative links work.
   */
  private async looseVault(uri: string): Promise<Vault> {
    const root = uri.slice(0, uri.lastIndexOf("/"));
    const index = new MemoryVaultIndex({
      root,
      folderNote: "",
      linkFormat: "shortest",
    });
    const listing = await this.system.list(root, 1_000, true);
    index.replaceFiles(listing.files);
    return {
      index,
      settled: async () => {},
      pathOf: (target) => pathInside(root, target),
    };
  }

  /** The nearest opened vault containing a URI. */
  private owner(
    uri: string,
  ): { vault: IndexedVault; path: string } | undefined {
    let best: { vault: IndexedVault; path: string } | undefined;
    for (const vault of this.opened.values()) {
      const path = vault.pathOf(uri);
      const isNearer =
        !best || vault.index.root.length > best.vault.index.root.length;
      if (path !== undefined && isNearer) {
        best = { vault, path };
      }
    }
    return best;
  }
}

class IndexedVault implements Vault {
  constructor(
    private readonly root: string,
    readonly indexer: VaultIndexer,
  ) {}

  get index() {
    return this.indexer.index;
  }

  settled(): Promise<void> {
    return this.indexer.settled();
  }

  pathOf(uri: string): string | undefined {
    return pathInside(this.root, uri);
  }
}

function pathInside(root: string, uri: string): string | undefined {
  const prefix = root.replace(/\/+$/, "") + "/";
  if (!uri.startsWith(prefix)) {
    return undefined;
  }
  try {
    return decodeURIComponent(uri.slice(prefix.length));
  } catch {
    return undefined;
  }
}
