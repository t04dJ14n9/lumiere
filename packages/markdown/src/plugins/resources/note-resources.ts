import type { HostServices } from "../../shared/host";
import { mediaKind } from "../../shared/media-kinds";
import type { LinkSyntax } from "../../shared/vault-path";
import type { VaultFile, VaultIndex } from "../vault/api";
import type { BaseNoteEntry, Resource, Resources } from "./api";
import { containedResource, contains } from "./containment";

interface ResourceOptions {
  source: string;
  vault: VaultIndex;
  host: Pick<HostServices, "workspace" | "hostDocuments">;
  resourceUrl(uri: string): string;
}

export class NoteResources implements Resources {
  private readonly known: Set<string>;
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
    const relativeSource = decodeURIComponent(new URL(source).pathname).slice(
      decodeURIComponent(new URL(vault.root).pathname).replace(/\/$/, "")
        .length + 1,
    );
    const file = vault.resolveLink(target, relativeSource, syntax);
    if (!file) {
      throw new Error("Resource not found");
    }
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
        ? buildBaseVaultSnapshot(vault, relativeSource)
        : undefined;
    return {
      kind,
      source: file.uri,
      url: resourceUrl(file.uri) + `?v=${stat.mtime}`,
      ...(text === undefined ? {} : { text }),
      ...(baseSnapshot ?? {}),
    };
  }

  private assertKnown(source: string): void {
    if (!this.known.has(source) || !contains(this.options.vault.root, source)) {
      throw new Error("Unknown note source");
    }
  }

  private async containedStat(source: string) {
    const { host, vault } = this.options;
    const stat = await host.workspace.stat(source);
    await containedResource(vault.root, source, stat.symbolicLink, (uri) =>
      host.workspace.stat(uri),
    );
    return stat;
  }

  private async readNote(uri: string): Promise<string> {
    const text = (await this.options.host.hostDocuments.open(uri)).getText();
    return text.replace(/\r\n/g, "\n");
  }
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
