import type { Workbench } from "../../shared/runtime";
import { mediaKind } from "../../shared/media-kinds";
import type { VaultIndex } from "../vault/api";
import type { Resource, Resources } from "./api";
import { containedResource, contains } from "./containment";

interface ResourceOptions {
  source: string;
  vault: VaultIndex;
  files: Pick<Workbench, "stat" | "read" | "openDocument">;
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

  async load(target: string, source = this.options.source): Promise<Resource> {
    this.assertKnown(source);
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) {
      throw new Error("Resource must be a vault link");
    }
    const { vault, resourceUrl } = this.options;
    const relativeSource = decodeURIComponent(new URL(source).pathname).slice(
      decodeURIComponent(new URL(vault.root).pathname).replace(/\/$/, "")
        .length + 1,
    );
    const file = vault.resolveLink(target, relativeSource);
    if (!file) {
      throw new Error("Resource not found");
    }
    const stat = await this.containedStat(file.uri);
    const kind = resourceKind(file.path);
    const text = kind === "note" ? await this.readNote(file.uri) : undefined;
    if (kind === "note") {
      this.known.add(file.uri);
    }
    return {
      kind,
      source: file.uri,
      url: resourceUrl(file.uri) + `?v=${stat.mtime}`,
      ...(text === undefined ? {} : { text }),
    };
  }

  private assertKnown(source: string): void {
    if (!this.known.has(source) || !contains(this.options.vault.root, source)) {
      throw new Error("Unknown note source");
    }
  }

  private async containedStat(source: string) {
    const { files, vault } = this.options;
    const stat = await files.stat(source);
    await containedResource(vault.root, source, stat.symbolicLink, (uri) =>
      files.stat(uri),
    );
    return stat;
  }

  private async readNote(uri: string): Promise<string> {
    const { files } = this.options;
    const text = files.openDocument
      ? (await files.openDocument(uri)).getText()
      : new TextDecoder().decode(await files.read(uri));
    return text.replace(/\r\n/g, "\n");
  }
}

export function resourceKind(path: string): Resource["kind"] {
  if (/\.md$/i.test(path)) {
    return "note";
  }
  if (/\.pdf$/i.test(path)) {
    return "pdf";
  }
  return mediaKind(path) ?? "file";
}
