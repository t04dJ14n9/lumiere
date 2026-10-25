import {
  isValidPluginId,
  type ObsidianPluginManifest,
} from "../obsidianCompat/api";
import type { CatalogPluginEntry, MarketplacePluginEntry } from "./api";

export const COMMUNITY_PLUGINS_URL =
  "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json";
export const COMMUNITY_PLUGIN_STATS_URL =
  "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugin-stats.json";

const VALID_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

export interface DownloadedPluginRelease {
  readonly manifestRaw: string;
  readonly manifest: ObsidianPluginManifest;
  readonly mainJs: string;
  readonly stylesCss?: string;
}

export type MarketplaceFilterTab = "all" | "installed" | "enabled";
export type MarketplaceSortBy = "downloads" | "name";

export interface MarketplaceFilterOptions {
  readonly query?: string;
  readonly filter?: MarketplaceFilterTab;
  readonly sort?: MarketplaceSortBy;
}

export function isValidRepo(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 256 &&
    !value.includes("..") &&
    VALID_REPO.test(value)
  );
}

export function parseCatalogJson(
  rawCatalog: string,
  rawStats?: string,
): CatalogPluginEntry[] {
  const stats = parseStatsMap(rawStats);
  try {
    const parsed: unknown = JSON.parse(rawCatalog);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const entries: CatalogPluginEntry[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const entry = toCatalogEntry(item, stats);
      if (entry && !seen.has(entry.id)) {
        seen.add(entry.id);
        entries.push(entry);
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function toCatalogEntry(
  raw: unknown,
  stats: ReadonlyMap<string, number>,
): CatalogPluginEntry | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (
    !isValidPluginId(obj.id) ||
    typeof obj.name !== "string" ||
    obj.name.trim().length === 0 ||
    !isValidRepo(obj.repo)
  ) {
    return undefined;
  }
  return {
    id: obj.id,
    name: obj.name.trim(),
    author: typeof obj.author === "string" ? obj.author.trim() : "",
    description:
      typeof obj.description === "string" ? obj.description.trim() : "",
    repo: obj.repo,
    downloads: stats.get(obj.id) ?? 0,
  };
}

function extractDownloadCount(value: unknown): number | undefined {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).downloads
      : value;
  return typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate >= 0
    ? candidate
    : undefined;
}

function parseStatsMap(rawStats: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!rawStats) {
    return map;
  }
  try {
    const parsed: unknown = JSON.parse(rawStats);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return map;
    }
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const downloads = extractDownloadCount(value);
      if (downloads !== undefined) {
        map.set(id, downloads);
      }
    }
  } catch {
    // Ignore malformed stats JSON.
  }
  return map;
}

export function parseStrictManifest(
  raw: string,
  expectedId: string,
): ObsidianPluginManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const obj = parsed as Record<string, unknown>;
    if (
      obj.id !== expectedId ||
      !isValidPluginId(obj.id) ||
      typeof obj.name !== "string" ||
      obj.name.trim().length === 0 ||
      typeof obj.version !== "string" ||
      obj.version.trim().length === 0
    ) {
      return undefined;
    }
    return {
      id: expectedId,
      name: obj.name.trim(),
      version: obj.version.trim(),
      ...(typeof obj.description === "string"
        ? { description: obj.description }
        : {}),
      ...(typeof obj.author === "string" ? { author: obj.author } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function downloadPluginRelease(
  fetchFn: FetchLike,
  repo: string,
  expectedId: string,
): Promise<DownloadedPluginRelease> {
  if (!isValidRepo(repo)) {
    throw new Error(`Invalid Obsidian plugin repository: ${String(repo)}`);
  }
  const baseUrl = `https://github.com/${repo}/releases/latest/download`;
  const [manifestRes, mainRes, stylesRes] = await Promise.all([
    fetchFn(`${baseUrl}/manifest.json`),
    fetchFn(`${baseUrl}/main.js`),
    fetchFn(`${baseUrl}/styles.css`).catch(() => ({
      ok: false,
      status: 404,
      text: async () => "",
    })),
  ]);
  if (manifestRes.ok && mainRes.ok) {
    const [manifestRaw, mainJs, stylesCss] = await Promise.all([
      manifestRes.text(),
      mainRes.text(),
      stylesRes.ok ? stylesRes.text() : Promise.resolve(undefined),
    ]);
    return validateDownloadedRelease(
      expectedId,
      manifestRaw,
      mainJs,
      stylesCss,
    );
  }
  return downloadViaGitHubApi(fetchFn, repo, expectedId);
}

async function downloadViaGitHubApi(
  fetchFn: FetchLike,
  repo: string,
  expectedId: string,
): Promise<DownloadedPluginRelease> {
  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  const releaseRes = await fetchFn(apiUrl);
  if (!releaseRes.ok) {
    throw new Error(
      `Failed to download release for ${repo} (HTTP ${releaseRes.status}).`,
    );
  }
  const releaseJson = JSON.parse(await releaseRes.text()) as {
    assets?: readonly { name?: string; browser_download_url?: string }[];
  };
  const assets = Array.isArray(releaseJson.assets) ? releaseJson.assets : [];
  const findAsset = (name: string) =>
    assets.find((item) => item.name === name)?.browser_download_url;
  const manifestUrl = findAsset("manifest.json");
  const mainUrl = findAsset("main.js");
  if (!manifestUrl || !mainUrl) {
    throw new Error(
      `Release for ${repo} is missing manifest.json or main.js assets.`,
    );
  }
  const stylesUrl = findAsset("styles.css");
  const [manifestRes, mainRes, stylesRes] = await Promise.all([
    fetchFn(manifestUrl),
    fetchFn(mainUrl),
    stylesUrl ? fetchFn(stylesUrl) : Promise.resolve(undefined),
  ]);
  if (!manifestRes.ok || !mainRes.ok) {
    throw new Error(`Failed to fetch release assets for ${repo}.`);
  }
  const [manifestRaw, mainJs, stylesCss] = await Promise.all([
    manifestRes.text(),
    mainRes.text(),
    stylesRes?.ok ? stylesRes.text() : Promise.resolve(undefined),
  ]);
  return validateDownloadedRelease(expectedId, manifestRaw, mainJs, stylesCss);
}

function validateDownloadedRelease(
  expectedId: string,
  manifestRaw: string,
  mainJs: string,
  stylesCss: string | undefined,
): DownloadedPluginRelease {
  const manifest = parseStrictManifest(manifestRaw, expectedId);
  if (!manifest) {
    throw new Error(
      `Downloaded manifest.json for "${expectedId}" is invalid or mismatched.`,
    );
  }
  if (mainJs.trim().length === 0) {
    throw new Error(`Downloaded main.js for "${expectedId}" is empty.`);
  }
  return {
    manifestRaw,
    manifest,
    mainJs,
    ...(stylesCss !== undefined ? { stylesCss } : {}),
  };
}

export function filterMarketplaceItems(
  items: readonly MarketplacePluginEntry[],
  options: MarketplaceFilterOptions = {},
): MarketplacePluginEntry[] {
  const filter = options.filter ?? "all";
  const sort = options.sort ?? "downloads";
  const query = (options.query ?? "").trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (filter === "installed" && !item.installed) {
      return false;
    }
    if (filter === "enabled" && !item.enabled) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query) ||
      item.author.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    );
  });
  return [...filtered].sort((a, b) => {
    if (sort === "name") {
      return a.name.localeCompare(b.name);
    }
    if (b.downloads !== a.downloads) {
      return b.downloads - a.downloads;
    }
    return a.name.localeCompare(b.name);
  });
}

export function mergeCatalogAndInstalled(
  remoteCatalog: readonly CatalogPluginEntry[],
  installedMap: ReadonlyMap<string, ObsidianPluginManifest>,
  enabledSet: ReadonlySet<string>,
): MarketplacePluginEntry[] {
  const seen = new Set<string>();
  const items: MarketplacePluginEntry[] = [];
  for (const entry of remoteCatalog) {
    const local = installedMap.get(entry.id);
    seen.add(entry.id);
    items.push({
      ...entry,
      installed: Boolean(local),
      enabled: Boolean(local) && enabledSet.has(entry.id),
      ...(local ? { installedVersion: local.version } : {}),
    });
  }
  for (const [id, manifest] of installedMap) {
    if (seen.has(id)) {
      continue;
    }
    items.push({
      id,
      name: manifest.name,
      author: manifest.author ?? "",
      description: manifest.description ?? "",
      repo: "",
      downloads: 0,
      installed: true,
      enabled: enabledSet.has(id),
      installedVersion: manifest.version,
    });
  }
  return items;
}

export function parseEnabledIdsJson(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => isValidPluginId(item))
      : [];
  } catch {
    return [];
  }
}

export function relativeConfigName(
  vaultRoot: string,
  configDirUri: string,
): string {
  const prefix = `${vaultRoot.replace(/\/+$/, "")}/`;
  if (configDirUri.startsWith(prefix)) {
    return decodeURIComponent(configDirUri.slice(prefix.length)) || ".obsidian";
  }
  return ".obsidian";
}

export function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  return error.code === "FileNotFound" || error.code === "ENOENT";
}
