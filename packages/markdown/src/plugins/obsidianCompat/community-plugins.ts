import type { HostServices } from "../../shared/host";
import { joinContained } from "../../shared/workspace-path";
import type { CommunityPluginBundle, ObsidianPluginManifest } from "./api";
import { resolveConfigDirectory } from "./config-dir";

const VALID_PLUGIN_ID = /^[A-Za-z0-9._-]+$/;

export function isValidPluginId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value !== "." &&
    value !== ".." &&
    VALID_PLUGIN_ID.test(value)
  );
}

export interface LoadedCommunityPlugins {
  readonly trusted: boolean;
  readonly configDir: string;
  readonly configDirUri: string;
  readonly plugins: readonly CommunityPluginBundle[];
}

export class CommunityPluginLoader {
  constructor(private readonly host: Pick<HostServices, "workspace">) {}

  async loadEnabledPlugins(
    vaultRoot: string,
    configFolder: string | undefined,
  ): Promise<LoadedCommunityPlugins> {
    const configDirUri = resolveConfigDirectory(vaultRoot, configFolder);
    const configDir = relativeConfigName(vaultRoot, configDirUri);
    if (!this.allows(vaultRoot)) {
      return { trusted: false, configDir, configDirUri, plugins: [] };
    }
    const plugins: CommunityPluginBundle[] = [];
    for (const pluginId of await this.enabledPluginIds(
      vaultRoot,
      configFolder,
    )) {
      const bundle = await this.loadSinglePlugin(
        vaultRoot,
        configDirUri,
        configDir,
        pluginId,
      );
      if (bundle) {
        plugins.push(bundle);
      }
    }
    return { trusted: true, configDir, configDirUri, plugins };
  }

  /**
   * The plugins the vault turns on (`community-plugins.json`). Reading the
   * list runs nothing, so it needs no trust: it is what the owner is asked about.
   */
  async enabledPluginIds(
    vaultRoot: string,
    configFolder: string | undefined,
  ): Promise<string[]> {
    const configDirUri = resolveConfigDirectory(vaultRoot, configFolder);
    const listUri = joinContained(configDirUri, "community-plugins.json");
    if (!listUri) {
      return [];
    }
    return parseEnabledPluginIds(
      await this.readOptionalUtf8(vaultRoot, listUri),
    );
  }

  async loadPluginData(
    vaultRoot: string,
    configFolder: string | undefined,
    pluginId: string,
  ): Promise<unknown> {
    this.assertAllowed(vaultRoot, "load plugin data");
    const dataUri = await this.authorizePluginFile(
      vaultRoot,
      configFolder,
      pluginId,
      "data.json",
    );
    const text = await this.readOptionalUtf8(vaultRoot, dataUri);
    if (text === undefined || text.trim() === "") {
      return null;
    }
    return JSON.parse(text) as unknown;
  }

  async savePluginData(
    vaultRoot: string,
    configFolder: string | undefined,
    pluginId: string,
    data: unknown,
  ): Promise<void> {
    this.assertAllowed(vaultRoot, "save plugin data");
    const dataUri = await this.authorizePluginFile(
      vaultRoot,
      configFolder,
      pluginId,
      "data.json",
    );
    const serialized = `${JSON.stringify(data ?? {}, null, 2)}\n`;
    await this.host.workspace.files.writeText(dataUri, serialized);
  }

  private async loadSinglePlugin(
    vaultRoot: string,
    configDirUri: string,
    configDir: string,
    pluginId: string,
  ): Promise<CommunityPluginBundle | undefined> {
    const pluginDirUri = joinContained(configDirUri, `plugins/${pluginId}`);
    if (!pluginDirUri) {
      return undefined;
    }
    try {
      await this.authorize(vaultRoot, pluginDirUri);
      const manifestUri = joinContained(pluginDirUri, "manifest.json");
      const mainJsUri = joinContained(pluginDirUri, "main.js");
      if (!manifestUri || !mainJsUri) {
        return undefined;
      }
      const [manifestRaw, mainJs] = await Promise.all([
        this.readOptionalUtf8(vaultRoot, manifestUri),
        this.readOptionalUtf8(vaultRoot, mainJsUri),
      ]);
      if (manifestRaw === undefined || mainJs === undefined) {
        return undefined;
      }
      const manifest = parsePluginManifest(
        manifestRaw,
        pluginId,
        `${configDir}/plugins/${pluginId}`,
      );
      if (!manifest) {
        return undefined;
      }
      const stylesUri = joinContained(pluginDirUri, "styles.css");
      const dataUri = joinContained(pluginDirUri, "data.json");
      const [stylesCss, dataRaw] = await Promise.all([
        stylesUri
          ? this.readOptionalUtf8(vaultRoot, stylesUri)
          : Promise.resolve(undefined),
        dataUri
          ? this.readOptionalUtf8(vaultRoot, dataUri)
          : Promise.resolve(undefined),
      ]);
      return {
        id: pluginId,
        manifest,
        mainJs,
        ...(stylesCss !== undefined ? { stylesCss } : {}),
        data: parseOptionalJson(dataRaw),
      };
    } catch {
      return undefined;
    }
  }

  private async authorizePluginFile(
    vaultRoot: string,
    configFolder: string | undefined,
    pluginId: string,
    fileName: string,
  ): Promise<string> {
    if (!isValidPluginId(pluginId)) {
      throw new Error(`Invalid Obsidian plugin ID: ${String(pluginId)}`);
    }
    const configDirUri = resolveConfigDirectory(vaultRoot, configFolder);
    const pluginDirUri = joinContained(configDirUri, `plugins/${pluginId}`);
    const fileUri = pluginDirUri
      ? joinContained(pluginDirUri, fileName)
      : undefined;
    if (!pluginDirUri || !fileUri) {
      throw new Error("Invalid Obsidian plugin file path.");
    }
    await this.authorize(vaultRoot, pluginDirUri);
    await this.authorize(vaultRoot, fileUri);
    return fileUri;
  }

  private async readOptionalUtf8(
    vaultRoot: string,
    uri: string,
  ): Promise<string | undefined> {
    await this.authorize(vaultRoot, uri);
    try {
      const bytes = await this.host.workspace.read(uri);
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      if (isMissingFile(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private async authorize(vaultRoot: string, uri: string): Promise<void> {
    const check = this.host.workspace.files.authorize;
    if (!check) {
      throw new Error("Contained configuration file access is unavailable.");
    }
    await check(vaultRoot, uri);
  }

  private allows(vaultRoot: string): boolean {
    return this.host.workspace.vaultCode.answer(vaultRoot) === true;
  }

  private assertAllowed(vaultRoot: string, operation: string): void {
    if (!this.allows(vaultRoot)) {
      throw new Error(`Cannot ${operation} in an untrusted vault.`);
    }
  }
}

function relativeConfigName(vaultRoot: string, configDirUri: string): string {
  const prefix = `${vaultRoot.replace(/\/+$/, "")}/`;
  if (configDirUri.startsWith(prefix)) {
    return decodeURIComponent(configDirUri.slice(prefix.length)) || ".obsidian";
  }
  return ".obsidian";
}

function parseEnabledPluginIds(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of parsed) {
      if (isValidPluginId(item) && !seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
    return result;
  } catch {
    return [];
  }
}

function parsePluginManifest(
  raw: string,
  expectedId: string,
  dir: string,
): ObsidianPluginManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const obj = parsed as Record<string, unknown>;
    if (
      obj.id !== expectedId ||
      typeof obj.name !== "string" ||
      obj.name.length === 0 ||
      typeof obj.version !== "string" ||
      obj.version.length === 0
    ) {
      return undefined;
    }
    return {
      id: expectedId,
      name: obj.name,
      version: obj.version,
      ...(typeof obj.minAppVersion === "string"
        ? { minAppVersion: obj.minAppVersion }
        : {}),
      ...(typeof obj.description === "string"
        ? { description: obj.description }
        : {}),
      ...(typeof obj.author === "string" ? { author: obj.author } : {}),
      ...(typeof obj.authorUrl === "string"
        ? { authorUrl: obj.authorUrl }
        : {}),
      ...(typeof obj.isDesktopOnly === "boolean"
        ? { isDesktopOnly: obj.isDesktopOnly }
        : {}),
      dir,
    };
  } catch {
    return undefined;
  }
}

function parseOptionalJson(raw: string | undefined): unknown {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isMissingFile(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  return error.code === "FileNotFound" || error.code === "ENOENT";
}
