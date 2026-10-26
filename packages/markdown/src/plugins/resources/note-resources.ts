import type { HostServices } from "../../shared/host";
import { mediaKind } from "../../shared/media-kinds";
import { decodeLinkPath, type LinkSyntax } from "../../shared/vault-path";
import type { VaultFile, VaultIndex } from "../vault/api";
import type { BaseNoteEntry, Resource, Resources } from "./api";
import { containedResource, contains } from "./containment";

interface ResourceOptions {
  source: string;
  vault: VaultIndex;
  host: Pick<HostServices, "workspace" | "hostDocuments">;
  resourceUrl(uri: string): string;
}

/** A link a note shows, as `load` receives it. */
interface ResourceLink {
  target: string;
  source: string;
  syntax: LinkSyntax;
}

/** Links remembered as missing at most; the oldest are forgotten first. */
const MISSING_LIMIT = 256;

export class NoteResources implements Resources {
  private readonly known: Set<string>;
  /** Links whose file the vault did not have when asked, by `linkKey`. */
  private readonly missing = new Map<string, ResourceLink>();
  constructor(private readonly options: ResourceOptions) {
    this.known = new Set([options.source]);
  }

  async authorize(source: string): Promise<void> {
    this.assertKnown(source);
    await this.containedStat(source);
  }

  async authorizeTarget(target: string): Promise<void> {
    await this.containedStat(target);
  }

  async load(
    target: string,
    source = this.options.source,
    syntax: LinkSyntax = "markdown",
  ): Promise<Resource> {
    this.assertKnown(source);
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) {
      throw new Error("Resource must be a vault link");
    }
    const { vault, resourceUrl } = this.options;
    const link = { target, source, syntax };
    const file = this.locate(link);
    if (!file) {
      this.rememberMissing(link);
      throw new Error("Resource not found");
    }
    this.missing.delete(linkKey(link));
    const stat = await this.containedStat(file.uri);
    const kind = resourceKind(file.path);
    const text =
      kind === "note" || kind === "base"
        ? await this.readNote(file.uri)
        : undefined;
    if (kind === "note" || kind === "base") {
      this.known.add(file.uri);
    }
    const baseSnapshot =
      kind === "base"
        ? buildBaseVaultSnapshot(vault, vaultPath(vault.root, source))
        : undefined;
    return {
      kind,
      source: file.uri,
      url: (() => {
        const base = resourceUrl(file.uri);
        return `${base}${base.includes("?") ? "&" : "?"}v=${stat.mtime}`;
      })(),
      ...(text === undefined ? {} : { text }),
      ...(baseSnapshot ?? {}),
    };
  }

  /**
   * Forget the missing links that resolve now, as when their file arrives
   * after the note asked (synced, or written by another app or a plugin).
   * True when there were any.
   */
  takeFound(): boolean {
    let isFound = false;
    for (const [key, link] of this.missing) {
      if (this.locate(link)) {
        this.missing.delete(key);
        isFound = true;
      }
    }
    return isFound;
  }

  /** The vault file a link names, if the vault has it. */
  private locate({
    target,
    source,
    syntax,
  }: ResourceLink): VaultFile | undefined {
    const { vault } = this.options;
    // A Markdown destination is percent-encoded (`My%20image.png`), and the
    // vault resolves paths as the note's metadata keeps them: decoded.
    return vault.resolveLink(
      syntax === "markdown" ? decodeLinkPath(target) : target,
      vaultPath(vault.root, source),
      syntax,
    );
  }

  private rememberMissing(link: ResourceLink): void {
    const key = linkKey(link);
    this.missing.delete(key);
    this.missing.set(key, link);
    if (this.missing.size > MISSING_LIMIT) {
      this.missing.delete(this.missing.keys().next().value!);
    }
  }

  private assertKnown(source: string): void {
    if (!this.known.has(source) || !contains(this.options.vault.root, source)) {
      throw new Error("Unknown note source");
    }
  }

  private async containedStat(source: string) {
    const { host, vault } = this.options;
    const { workspace } = host;
    const stat = await workspace.stat(source);
    const realContains = workspace.realContains?.bind(workspace);
    await containedResource(vault.root, source, stat.symbolicLink, {
      inspect: (uri) => workspace.stat(uri),
      ...(realContains ? { realContains } : {}),
    });
    return stat;
  }

  private async readNote(uri: string): Promise<string> {
    const text = (await this.options.host.hostDocuments.open(uri)).getText();
    return text.replace(/\r\n/g, "\n");
  }
}

function linkKey({ target, source, syntax }: ResourceLink): string {
  return `${syntax}\0${source}\0${target}`;
}

/** A note's path inside the vault, from its URI. */
function vaultPath(root: string, uri: string): string {
  return decodeURIComponent(new URL(uri).pathname).slice(
    decodeURIComponent(new URL(root).pathname).replace(/\/$/, "").length + 1,
  );
}

export function resourceKind(path: string): Resource["kind"] {
  if (/\.(?:md|markdown)$/i.test(path)) {
    return "note";
  }
  if (/\.base$/i.test(path)) {
    return "base";
  }
  if (/\.pdf$/i.test(path)) {
    return "pdf";
  }
  return mediaKind(path) ?? "file";
}

function buildBaseVaultSnapshot(
  vault: VaultIndex,
  relativeSource?: string,
): { entries: BaseNoteEntry[]; thisEntry?: BaseNoteEntry } {
  if (typeof vault.files !== "function") {
    return { entries: [] };
  }
  const entries: BaseNoteEntry[] = [];
  let thisEntry: BaseNoteEntry | undefined;
  for (const file of vault.files()) {
    if (!/^(?:md|markdown)$/i.test(file.extension) || file.excluded) {
      continue;
    }
    const entry = buildNoteEntry(vault, file);
    entries.push(entry);
    if (relativeSource && file.path === relativeSource) {
      thisEntry = entry;
    }
  }
  return { entries, ...(thisEntry ? { thisEntry } : {}) };
}

function buildNoteEntry(vault: VaultIndex, file: VaultFile): BaseNoteEntry {
  const meta =
    typeof vault.metadata === "function"
      ? vault.metadata(file.path)
      : undefined;
  const frontmatter = sanitizeFrontmatter(meta?.frontmatter);
  const tags = collectNoteTags(meta?.tags, frontmatter);
  const links = meta?.links?.map((l) => l.link) ?? [];
  const embeds = meta?.embeds?.map((e) => e.link) ?? [];
  const backlinks =
    typeof vault.backlinks === "function"
      ? vault.backlinks(file.path).map((b) => b.path)
      : [];
  return {
    path: file.path,
    basename: file.basename,
    extension: file.extension,
    mtime: file.mtime,
    size: file.size,
    ...(frontmatter ? { frontmatter } : {}),
    tags,
    links,
    embeds,
    backlinks,
  };
}

function sanitizeFrontmatter(
  raw?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = sanitizeValue(value);
  }
  return out;
}

function sanitizeValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  return String(value);
}

function collectNoteTags(
  inlineTags?: readonly { tag: string }[],
  frontmatter?: Record<string, unknown>,
): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  const addTag = (raw: unknown) => {
    if (typeof raw !== "string") {
      return;
    }
    const clean = raw.trim().replace(/^#/, "");
    if (!clean) {
      return;
    }
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(`#${clean}`);
    }
  };
  for (const t of inlineTags ?? []) {
    addTag(t.tag);
  }
  const fmTags = frontmatter?.tags ?? frontmatter?.tag;
  if (Array.isArray(fmTags)) {
    for (const item of fmTags) {
      addTag(item);
    }
  } else if (typeof fmTags === "string") {
    for (const part of fmTags.split(/[,\s]+/)) {
      addTag(part);
    }
  }
  return tags;
}
