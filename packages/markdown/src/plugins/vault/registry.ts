import { SourceCoordinates } from "../../shared/document/coordinates";
import type { Navigation } from "../../shared/host";
import { isMarkdownPath } from "../../shared/vault-path";
import type {
  LinkPolicy,
  Vault,
  VaultChange,
  Vaults,
  VaultSystem,
} from "./api";
import { INITIAL_READY_BUDGET_MS, VaultIndexer, waitUpTo } from "./indexer";
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
  private policies: readonly LinkPolicy[] = [];
  private readonly rootByFolder = new Map<string, Promise<string>>();

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
    let pending = this.ready.get(root);
    if (!pending) {
      pending = this.openVault(root);
      this.ready.set(root, pending);
    }
    const vault = await pending;
    vault.seedDocument(uri);
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
    options: { offset?: number; side?: boolean; fragment?: string } = {},
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
      options.fragment ?? "",
      options.side ? "side" : "here",
      at,
    );
  }

  all(): readonly Vault[] {
    return [...this.opened.values()];
  }

  registerLinkPolicy(policy: LinkPolicy): () => void {
    this.policies = [...this.policies, policy];
    this.applyPolicies();
    return () => {
      this.policies = this.policies.filter((item) => item !== policy);
      this.applyPolicies();
    };
  }

  invalidateLinkResolution(): void {
    for (const vault of this.opened.values()) {
      vault.indexer.index.invalidateLinkResolution();
    }
  }

  /** An open note's unsaved text replaces its file on disk in the index. */
  setOverlay(uri: string, text: string): void {
    this.openTexts.set(uri, text);
    const owner = this.owner(uri);
    if (owner && isMarkdownPath(owner.path)) {
      owner.vault.indexer.setOverlay(owner.path, text, uri);
    }
  }

  clearOverlay(uri: string): void {
    this.openTexts.delete(uri);
    const owner = this.owner(uri);
    owner?.vault.indexer.clearOverlay(owner.path);
  }

  applySettings(): void {
    this.rootByFolder.clear();
    for (const vault of this.opened.values()) {
      vault.indexer.applySettings();
    }
  }

  async dispose(): Promise<void> {
    const vaults = [...this.opened.values()];
    this.rootByFolder.clear();
    this.ready.clear();
    this.opened.clear();
    await Promise.all(vaults.map((vault) => vault.indexer.dispose()));
    this.parser?.dispose();
  }

  private async findRoot(uri: string, workspace: string): Promise<string> {
    const folders = foldersUpTo(uri, workspace);
    const cacheKey = `${workspace}\0${folders[0] ?? workspace}`;
    let pending = this.rootByFolder.get(cacheKey);
    if (!pending) {
      const markers = this.system.settings(workspace).rootMarkers;
      const hasMarker = async (folder: string) => {
        const checks = await Promise.all(
          markers.map((marker) => this.system.exists(`${folder}/${marker}`)),
        );
        return checks.includes(true);
      };
      pending = findVaultRoot(folders, hasMarker).then(
        (root) => root ?? workspace,
      );
      this.rootByFolder.set(cacheKey, pending);
    }
    return pending;
  }

  private async openVault(root: string): Promise<IndexedVault> {
    this.parser ??= this.system.createParser();
    const store = this.system.store(root);
    const indexer = new VaultIndexer({
      root,
      fs: this.system,
      ...(store && { store }),
      parse: this.parser.parse,
      hash: (text) => this.system.hash(text),
      settings: () => this.system.settings(root),
      onResolved: () => this.events.resolved(root),
      onPartial: () =>
        this.system.warn(
          `This vault has more than 50,000 files. Lumière indexes the first 50,000.`,
        ),
      onError: (message, error) => this.events.error(message, error),
    });
    indexer.index.onDidChange((change) => this.events.changed(root, change));
    indexer.index.setLinkPolicies(this.policies);
    const vault = new IndexedVault(root, indexer);
    this.opened.set(root, vault);
    for (const [uri, text] of this.openTexts) {
      const owner = this.owner(uri);
      if (owner?.vault === vault && isMarkdownPath(owner.path)) {
        vault.indexer.setOverlay(owner.path, text, uri);
      }
    }
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
    index.setLinkPolicies(this.policies);
    const listed = this.system
      .list(root, 1_000, true)
      .then((listing) => index.replaceFiles(listing.files))
      .catch((error) => this.events.error("Could not list the folder", error));
    await waitUpTo(listed, INITIAL_READY_BUDGET_MS);
    return {
      index,
      settled: () => listed,
      pathOf: (target) => pathInside(root, target),
    };
  }

  private applyPolicies(): void {
    for (const vault of this.opened.values()) {
      vault.indexer.index.setLinkPolicies(this.policies);
    }
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

  seedDocument(uri: string): void {
    const path = this.pathOf(uri);
    if (path && isMarkdownPath(path)) {
      this.indexer.seedFile(uri, path);
    }
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
