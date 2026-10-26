import type { Disposer } from "@workshop/core";
import type { HostServices } from "../../shared/host";
import { joinContained } from "../../shared/workspace-path";
import {
  CommunityPluginLoader,
  isValidPluginId,
  resolveConfigDirectory,
  type ObsidianPluginManifest,
} from "../obsidianCompat/api";
import type {
  CatalogPluginEntry,
  MarketplaceCatalogSnapshot,
  MarketplaceMutationResult,
  ObsidianMarketplace,
} from "./api";
import {
  COMMUNITY_PLUGINS_URL,
  COMMUNITY_PLUGIN_STATS_URL,
  downloadPluginRelease,
  isValidRepo,
  isMissingFileError,
  mergeCatalogAndInstalled,
  parseCatalogJson,
  parseEnabledIdsJson,
  parseStrictManifest,
  relativeConfigName,
  type FetchLike,
} from "./catalog-parser";

export interface MarketplaceServiceOptions {
  readonly workspace: HostServices["workspace"];
  readonly fetchFn?: FetchLike;
  readonly onChanged?: (vaultRoot: string) => void;
}

export class CommunityMarketplaceService implements ObsidianMarketplace {
  private readonly workspace: HostServices["workspace"];
  private readonly loader: CommunityPluginLoader;
  private readonly fetchFn: FetchLike;
  private readonly onChanged: ((vaultRoot: string) => void) | undefined;
  private readonly listeners = new Set<(vaultRoot: string) => void>();
  private cachedCatalog: CatalogPluginEntry[] | undefined;

  constructor(options: MarketplaceServiceOptions) {
    this.workspace = options.workspace;
    this.loader = new CommunityPluginLoader({ workspace: options.workspace });
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.onChanged = options.onChanged;
  }

  onDidChangePlugins(listener: (vaultRoot: string) => void): Disposer {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async fetchCatalog(
    forceRefresh = false,
  ): Promise<readonly CatalogPluginEntry[]> {
    this.assertTrusted("fetch Obsidian community plugin catalog");
    if (this.cachedCatalog && !forceRefresh) {
      return this.cachedCatalog;
    }
    try {
      const [catalogRes, statsRes] = await Promise.all([
        this.fetchFn(COMMUNITY_PLUGINS_URL),
        this.fetchFn(COMMUNITY_PLUGIN_STATS_URL).catch(() => ({
          ok: false,
          status: 0,
          text: async () => "",
        })),
      ]);
      if (!catalogRes.ok) {
        return this.cachedCatalog ?? [];
      }
      const [rawCatalog, rawStats] = await Promise.all([
        catalogRes.text(),
        statsRes.ok ? statsRes.text() : Promise.resolve(undefined),
      ]);
      const parsed = parseCatalogJson(rawCatalog, rawStats);
      this.cachedCatalog = parsed;
      return parsed;
    } catch {
      return this.cachedCatalog ?? [];
    }
  }

  async listCatalog(
    vaultRoot: string,
    configFolder?: string,
    forceRefresh = false,
  ): Promise<MarketplaceCatalogSnapshot> {
    const configDirUri = resolveConfigDirectory(vaultRoot, configFolder);
    const configDir = relativeConfigName(vaultRoot, configDirUri);
    if (this.workspace.vaultCode.answer(vaultRoot) !== true) {
      return { trusted: false, configDir, items: [] };
    }
    const [remoteCatalog, enabledIds, installedMap] = await Promise.all([
      this.fetchCatalog(forceRefresh),
      this.readEnabledPluginIds(vaultRoot, configDirUri),
      this.scanInstalledManifests(vaultRoot, configDirUri),
    ]);
    return {
      trusted: true,
      configDir,
      items: mergeCatalogAndInstalled(
        remoteCatalog,
        installedMap,
        new Set(enabledIds),
      ),
    };
  }

  async installPlugin(
    vaultRoot: string,
    configFolder: string | undefined,
    id: string,
    repo?: string,
  ): Promise<MarketplaceMutationResult> {
    this.assertVaultAllowed(vaultRoot, "install Obsidian community plugin");
    if (!isValidPluginId(id)) {
      throw new Error(`Invalid Obsidian plugin ID: ${String(id)}`);
    }
    const targetRepo = await this.resolveRepo(id, repo);
    const release = await downloadPluginRelease(this.fetchFn, targetRepo, id);
    const configDirUri = resolveConfigDirectory(vaultRoot, configFolder);
    await this.writePluginAssets(vaultRoot, configDirUri, id, release);
    const enabledIds = await this.updateEnabledList(
      vaultRoot,
      configDirUri,
      id,
      true,
    );
    return this.finishMutation(vaultRoot, configFolder, enabledIds, id);
  }

  async setPluginEnabled(
    vaultRoot: string,
    configFolder: string | undefined,
    id: string,
    enabled: boolean,
  ): Promise<MarketplaceMutationResult> {
    this.assertVaultAllowed(
      vaultRoot,
      "change Obsidian community plugin state",
    );
    if (!isValidPluginId(id)) {
      throw new Error(`Invalid Obsidian plugin ID: ${String(id)}`);
    }
    const configDirUri = resolveConfigDirectory(vaultRoot, configFolder);
    if (
      enabled &&
      !(await this.readInstalledManifest(vaultRoot, configDirUri, id))
    ) {
      throw new Error(`Obsidian plugin "${id}" is not installed.`);
    }
    const enabledIds = await this.updateEnabledList(
      vaultRoot,
      configDirUri,
      id,
      enabled,
    );
    return this.finishMutation(vaultRoot, configFolder, enabledIds, id);
  }

  async uninstallPlugin(
    vaultRoot: string,
    configFolder: string | undefined,
    id: string,
  ): Promise<MarketplaceMutationResult> {
    this.assertVaultAllowed(vaultRoot, "uninstall Obsidian community plugin");
    if (!isValidPluginId(id)) {
      throw new Error(`Invalid Obsidian plugin ID: ${String(id)}`);
    }
    const configDirUri = resolveConfigDirectory(vaultRoot, configFolder);
    const pluginDirUri = joinContained(configDirUri, `plugins/${id}`);
    if (!pluginDirUri) {
      throw new Error("Invalid Obsidian plugin directory path.");
    }
    await this.authorize(vaultRoot, pluginDirUri);
    const enabledIds = await this.updateEnabledList(
      vaultRoot,
      configDirUri,
      id,
      false,
    );
    try {
      await this.workspace.files.remove(pluginDirUri);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
    return this.finishMutation(vaultRoot, configFolder, enabledIds, id);
  }

  private async finishMutation(
    vaultRoot: string,
    configFolder: string | undefined,
    enabledIds: readonly string[],
    targetId: string,
  ): Promise<MarketplaceMutationResult> {
    const [snapshot, loaded] = await Promise.all([
      this.listCatalog(vaultRoot, configFolder, false),
      this.loader.loadEnabledPlugins(vaultRoot, configFolder),
    ]);
    this.emitChanged(vaultRoot);
    const item = snapshot.items.find((entry) => entry.id === targetId);
    return {
      trusted: snapshot.trusted,
      configDir: snapshot.configDir,
      enabledIds,
      ...(item ? { item } : {}),
      items: snapshot.items,
      plugins: loaded.plugins,
    };
  }

  private emitChanged(vaultRoot: string): void {
    this.onChanged?.(vaultRoot);
    for (const listener of this.listeners) {
      listener(vaultRoot);
    }
  }

  private async resolveRepo(id: string, repo?: string): Promise<string> {
    if (repo !== undefined) {
      if (!isValidRepo(repo)) {
        throw new Error(`Invalid Obsidian plugin repository: ${String(repo)}`);
      }
      return repo;
    }
    const catalog = await this.fetchCatalog(false);
    const found = catalog.find((entry) => entry.id === id);
    if (!found || !isValidRepo(found.repo)) {
      throw new Error(`Unknown repository for Obsidian plugin "${id}".`);
    }
    return found.repo;
  }

  private async writePluginAssets(
    vaultRoot: string,
    configDirUri: string,
    id: string,
    release: {
      readonly manifestRaw: string;
      readonly mainJs: string;
      readonly stylesCss?: string;
    },
  ): Promise<void> {
    const pluginsDirUri = joinContained(configDirUri, "plugins");
    const pluginDirUri = joinContained(configDirUri, `plugins/${id}`);
    const manifestUri =
      pluginDirUri && joinContained(pluginDirUri, "manifest.json");
    const mainJsUri = pluginDirUri && joinContained(pluginDirUri, "main.js");
    if (!pluginsDirUri || !pluginDirUri || !manifestUri || !mainJsUri) {
      throw new Error("Invalid Obsidian plugin target path.");
    }
    for (const uri of [
      configDirUri,
      pluginsDirUri,
      pluginDirUri,
      manifestUri,
      mainJsUri,
    ]) {
      await this.authorize(vaultRoot, uri);
    }
    for (const dir of [configDirUri, pluginsDirUri, pluginDirUri]) {
      await this.workspace.files.mkdir(dir);
    }
    await this.workspace.files.writeText(manifestUri, release.manifestRaw);
    await this.workspace.files.writeText(mainJsUri, release.mainJs);
    if (release.stylesCss !== undefined) {
      const stylesUri = joinContained(pluginDirUri, "styles.css");
      if (stylesUri) {
        await this.authorize(vaultRoot, stylesUri);
        await this.workspace.files.writeText(stylesUri, release.stylesCss);
      }
    }
  }

  private async updateEnabledList(
    vaultRoot: string,
    configDirUri: string,
    id: string,
    enabled: boolean,
  ): Promise<string[]> {
    const listUri = joinContained(configDirUri, "community-plugins.json");
    if (!listUri) {
      throw new Error("Invalid community-plugins.json path.");
    }
    await this.authorize(vaultRoot, configDirUri);
    await this.authorize(vaultRoot, listUri);
    const current = await this.readEnabledPluginIds(vaultRoot, configDirUri);
    const next = enabled
      ? [...new Set([...current, id])]
      : current.filter((item) => item !== id);
    await this.workspace.files.mkdir(configDirUri);
    await this.workspace.files.writeText(
      listUri,
      `${JSON.stringify(next, null, 2)}\n`,
    );
    return next;
  }

  private async readEnabledPluginIds(
    vaultRoot: string,
    configDirUri: string,
  ): Promise<string[]> {
    const listUri = joinContained(configDirUri, "community-plugins.json");
    if (!listUri) {
      return [];
    }
    return parseEnabledIdsJson(await this.readOptionalUtf8(vaultRoot, listUri));
  }

  private async scanInstalledManifests(
    vaultRoot: string,
    configDirUri: string,
  ): Promise<Map<string, ObsidianPluginManifest>> {
    const result = new Map<string, ObsidianPluginManifest>();
    const pluginsDirUri = joinContained(configDirUri, "plugins");
    if (!pluginsDirUri) {
      return result;
    }
    const candidateIds = new Set<string>(
      await this.readEnabledPluginIds(vaultRoot, configDirUri),
    );
    try {
      await this.authorize(vaultRoot, pluginsDirUri);
      const listed = await this.workspace.files.list(pluginsDirUri);
      for (const name of listed ?? []) {
        const clean = name.replace(/\/+$/, "").split("/").at(-1) ?? "";
        if (isValidPluginId(clean)) {
          candidateIds.add(clean);
        }
      }
    } catch {
      // Directory may not exist yet.
    }
    for (const id of candidateIds) {
      const manifest = await this.readInstalledManifest(
        vaultRoot,
        configDirUri,
        id,
      );
      if (manifest) {
        result.set(id, manifest);
      }
    }
    return result;
  }

  private async readInstalledManifest(
    vaultRoot: string,
    configDirUri: string,
    id: string,
  ): Promise<ObsidianPluginManifest | undefined> {
    const pluginDirUri = joinContained(configDirUri, `plugins/${id}`);
    const manifestUri = pluginDirUri
      ? joinContained(pluginDirUri, "manifest.json")
      : undefined;
    const mainJsUri = pluginDirUri
      ? joinContained(pluginDirUri, "main.js")
      : undefined;
    if (!pluginDirUri || !manifestUri || !mainJsUri) {
      return undefined;
    }
    try {
      const [manifestRaw, mainJs] = await Promise.all([
        this.readOptionalUtf8(vaultRoot, manifestUri),
        this.readOptionalUtf8(vaultRoot, mainJsUri),
      ]);
      if (manifestRaw === undefined || mainJs === undefined) {
        return undefined;
      }
      return parseStrictManifest(manifestRaw, id);
    } catch {
      return undefined;
    }
  }

  private async readOptionalUtf8(
    vaultRoot: string,
    uri: string,
  ): Promise<string | undefined> {
    await this.authorize(vaultRoot, uri);
    try {
      const bytes = await this.workspace.read(uri);
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private async authorize(vaultRoot: string, uri: string): Promise<void> {
    const check = this.workspace.files.authorize;
    if (!check) {
      throw new Error("Contained configuration file access is unavailable.");
    }
    await check(vaultRoot, uri);
  }

  /** Fetching the public catalog needs the workspace's trust (network). */
  private assertTrusted(operation: string): void {
    if (!this.workspace.isTrusted()) {
      throw new Error(`Cannot ${operation} in an untrusted workspace.`);
    }
  }

  /** Plugins installed or turned on will run, so the vault must allow its code. */
  private assertVaultAllowed(vaultRoot: string, operation: string): void {
    if (this.workspace.vaultCode.answer(vaultRoot) !== true) {
      throw new Error(`Cannot ${operation} in an untrusted vault.`);
    }
  }
}
