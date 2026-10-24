import {
  metadata,
  type LinkMetadata,
  type NoteMetadata,
  type Position,
} from "../../markdown/metadata";
import {
  extensionOf,
  folderDistance,
  folderOf,
  lookupKey,
  splitLinktext,
} from "../../shared/vault-path";
import {
  Events,
  normalizePath,
  parseYaml,
  stringifyYaml,
} from "./obsidian-core";
import type { TAbstractFile, TFile, TFolder, Vault } from "./obsidian-files";
import { getFrontMatterInfo } from "./obsidian-metadata-helpers";

export * from "./obsidian-metadata-helpers";

export interface HeadingCache {
  heading: string;
  level: number;
  position: Position;
}

export interface TagCache {
  tag: string;
  position: Position;
}

export interface CachedMetadata {
  links?: LinkMetadata[];
  embeds?: LinkMetadata[];
  tags?: TagCache[];
  headings?: HeadingCache[];
  sections?: NoteMetadata["sections"];
  blocks?: NoteMetadata["blocks"];
  listItems?: NoteMetadata["listItems"];
  frontmatter?: Record<string, unknown>;
  frontmatterPosition?: Position;
  frontmatterLinks?: NoteMetadata["frontmatterLinks"];
}

export function toCachedMetadata(note: NoteMetadata): CachedMetadata {
  const cached: CachedMetadata = {};
  if (note.links.length > 0) {
    cached.links = note.links.map((item) => ({ ...item }));
  }
  if (note.embeds.length > 0) {
    cached.embeds = note.embeds.map((item) => ({ ...item }));
  }
  if (note.tags.length > 0) {
    cached.tags = note.tags.map((item) => ({
      tag: item.tag.startsWith("#") ? item.tag : `#${item.tag}`,
      position: item.position,
    }));
  }
  if (note.headings.length > 0) {
    cached.headings = note.headings.map((item) => ({
      heading: item.heading,
      level: item.level,
      position: item.position,
    }));
  }
  if (note.sections.length > 0) {
    cached.sections = note.sections.map((item) => ({ ...item }));
  }
  if (Object.keys(note.blocks).length > 0) {
    cached.blocks = { ...note.blocks };
  }
  if (note.listItems.length > 0) {
    cached.listItems = note.listItems.map((item) => ({ ...item }));
  }
  if (note.frontmatter !== undefined) {
    cached.frontmatter = { ...note.frontmatter };
  }
  if (note.frontmatterLinks.length > 0) {
    cached.frontmatterLinks = note.frontmatterLinks.map((item) => ({
      ...item,
    }));
  }
  return cached;
}

export class MetadataCache extends Events {
  resolvedLinks: Record<string, Record<string, number>> = {};
  unresolvedLinks: Record<string, Record<string, number>> = {};
  private readonly cacheByPath = new Map<string, CachedMetadata>();

  constructor(private readonly vault: Vault) {
    super();
  }

  getFileCache(file: TFile | null | undefined): CachedMetadata | null {
    return file ? this.getCache(file.path) : null;
  }

  getCache(path: string): CachedMetadata | null {
    const clean = normalizePath(path);
    const existing = this.cacheByPath.get(clean);
    if (existing) {
      return existing;
    }
    const content = this.vault.getCachedContent(clean);
    if (content !== undefined) {
      const computed = toCachedMetadata(metadata(content));
      this.cacheByPath.set(clean, computed);
      this.recomputeLinksFor(clean, computed);
      return computed;
    }
    return null;
  }

  setFileContent(file: TFile, content: string): CachedMetadata {
    const clean = normalizePath(file.path);
    const computed = toCachedMetadata(metadata(content));
    this.cacheByPath.set(clean, computed);
    this.recomputeLinksFor(clean, computed);
    this.trigger("changed", file, content, computed);
    this.trigger("resolve", file);
    this.trigger("resolved");
    return computed;
  }

  setCache(path: string, cached: CachedMetadata | NoteMetadata): void {
    const clean = normalizePath(path);
    const normalized =
      "footnotes" in cached
        ? toCachedMetadata(cached as NoteMetadata)
        : (cached as CachedMetadata);
    this.cacheByPath.set(clean, normalized);
    this.recomputeLinksFor(clean, normalized);
  }

  deleteCache(path: string): void {
    const clean = normalizePath(path);
    this.cacheByPath.delete(clean);
    delete this.resolvedLinks[clean];
    delete this.unresolvedLinks[clean];
  }

  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
    const { path: rawTarget } = splitLinktext(String(linkpath ?? ""));
    const cleanSource = normalizePath(sourcePath);
    if (!rawTarget) {
      return this.vault.getFileByPath(cleanSource);
    }
    const resolvedTarget = resolveRelativeLinkpath(rawTarget, cleanSource);
    const allFiles = this.vault.getFiles();
    const direct = findDirectMatch(allFiles, resolvedTarget);
    if (direct) {
      return direct;
    }
    const candidates = findSuffixMatches(allFiles, resolvedTarget, cleanSource);
    return candidates[0] ?? null;
  }

  fileToLinktext(
    file: TFile,
    _sourcePath: string,
    omitMdExtension = true,
  ): string {
    const isMd = file.extension.toLowerCase() === "md";
    const key = lookupKey(file.path);
    const matching = this.vault
      .getFiles()
      .filter((candidate) => lookupKey(candidate.path) === key);
    if (matching.length <= 1) {
      return omitMdExtension && isMd ? file.basename : file.name;
    }
    return omitMdExtension && isMd ? file.path.slice(0, -3) : file.path;
  }

  private recomputeLinksFor(sourcePath: string, cached: CachedMetadata): void {
    const resolved: Record<string, number> = {};
    const unresolved: Record<string, number> = {};
    for (const ref of [...(cached.links ?? []), ...(cached.embeds ?? [])]) {
      const { path: targetLink } = splitLinktext(ref.link);
      if (!targetLink) {
        continue;
      }
      const dest = this.getFirstLinkpathDest(targetLink, sourcePath);
      if (dest) {
        resolved[dest.path] = (resolved[dest.path] ?? 0) + 1;
      } else {
        unresolved[targetLink] = (unresolved[targetLink] ?? 0) + 1;
      }
    }
    this.resolvedLinks[sourcePath] = resolved;
    this.unresolvedLinks[sourcePath] = unresolved;
  }
}

function resolveRelativeLinkpath(target: string, sourcePath: string): string {
  if (!target.startsWith("./") && !target.startsWith("../")) {
    return normalizePath(target);
  }
  const parts = `${folderOf(sourcePath)}/${target}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      out.pop();
    } else if (part && part !== ".") {
      out.push(part);
    }
  }
  return out.join("/");
}

function findDirectMatch(files: TFile[], target: string): TFile | undefined {
  const lower = target.toLowerCase();
  const hasExt = Boolean(extensionOf(target));
  for (const file of files) {
    const fileLower = file.path.toLowerCase();
    if (fileLower === lower || fileLower === `${lower}.md`) {
      return file;
    }
  }
  if (!target.includes("/")) {
    const matches = files.filter((file) => {
      const fLower = file.name.toLowerCase();
      const stemLower = file.basename.toLowerCase();
      return hasExt
        ? fLower === lower
        : (file.extension.toLowerCase() === "md" && stemLower === lower) ||
            fLower === lower;
    });
    if (matches.length === 1) {
      return matches[0];
    }
  }
  return undefined;
}

function findSuffixMatches(
  files: TFile[],
  target: string,
  sourcePath: string,
): TFile[] {
  const wanted = target.toLowerCase();
  const wantedMd = extensionOf(wanted) ? wanted : `${wanted}.md`;
  const srcFolder = folderOf(sourcePath);
  return files
    .filter((file) => {
      const candidate = file.path.toLowerCase();
      return (
        candidate === wantedMd ||
        candidate.endsWith(`/${wantedMd}`) ||
        candidate === wanted ||
        candidate.endsWith(`/${wanted}`)
      );
    })
    .map((file) => ({
      file,
      distance: folderDistance(srcFolder, folderOf(file.path)),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance || a.file.path.localeCompare(b.file.path),
    )
    .map((item) => item.file);
}

export class FileManager {
  constructor(
    private readonly vault: Vault,
    private readonly metadataCache: MetadataCache,
  ) {}

  async processFrontMatter(
    file: TFile,
    fn: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    const content = await this.vault.read(file);
    const info = getFrontMatterInfo(content);
    const fmObj =
      info.exists && info.frontmatter.trim()
        ? ((parseYaml(info.frontmatter) as Record<string, unknown> | null) ??
          {})
        : {};
    fn(fmObj);
    const serialized = stringifyYaml(fmObj).trimEnd();
    const rest = info.exists ? content.slice(info.contentStart) : content;
    await this.vault.modify(file, `---\n${serialized}\n---\n${rest}`);
  }

  generateMarkdownLink(
    file: TFile,
    sourcePath: string,
    subpath?: string,
    alias?: string,
  ): string {
    const linktext = this.metadataCache.fileToLinktext(file, sourcePath, true);
    let sub = "";
    if (subpath) {
      sub = subpath.startsWith("#") ? subpath : `#${subpath}`;
    }
    const display = alias ? `|${alias}` : "";
    return `[[${linktext}${sub}${display}]]`;
  }

  async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
    await this.vault.rename(file, newPath);
  }

  async trashFile(file: TAbstractFile): Promise<void> {
    await this.vault.trash(file, false);
  }

  getNewFileParent(sourcePath: string): TFolder {
    const folderPath = folderOf(normalizePath(sourcePath));
    return this.vault.getFolderByPath(folderPath) ?? this.vault.getRoot();
  }
}
