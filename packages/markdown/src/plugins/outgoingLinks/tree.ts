import type { TreeNode, TreeSource } from "../../shared/host";
import { folderOf, stemOf } from "../../shared/vault-path";
import { contributionId } from "../../shared/setting-schema";
import type { Vault, Vaults } from "../vault/api";
import { unlinkedLines } from "../../markdown/mentions";
import type { MentionLine } from "../../markdown/mentions";

export const VIEW_ID = contributionId("outgoingLinks");
export const OPEN_COMMAND = contributionId("outgoingLinks.open");
/** Create and open a note for an unresolved outbound linkpath. */
export const CREATE_COMMAND = contributionId("outgoingLinks.create");

/**
 * The Outgoing links view for the active note: files it links to, links whose
 * note does not exist yet, and (on expand) other notes mentioned by name
 * without a link — Obsidian's Unlinked mentions section.
 */
export class OutgoingLinksTree implements TreeSource {
  private note?: { path: string; uri: string; vault: Vault };
  /** Context lines under each unlinked target path, filled on first expand. */
  private readonly lines = new Map<string, MentionLine[]>();
  private unlinkedPaths?: Promise<string[]>;

  constructor(private readonly vaults: Vaults) {}

  async setNote(uri: string | undefined): Promise<void> {
    this.lines.clear();
    delete this.unlinkedPaths;
    const located = uri ? await this.vaults.locate(uri) : undefined;
    if (located && uri) {
      this.note = { uri, ...located };
    } else {
      delete this.note;
    }
  }

  get hasNote(): boolean {
    return this.note !== undefined;
  }

  roots(): TreeNode[] {
    if (!this.note) {
      return [];
    }
    const { index } = this.note.vault;
    const resolved = index.resolvedLinks(this.note.path);
    const unresolved = index.unresolvedLinks(this.note.path);
    return [
      {
        id: "links",
        label: "Links",
        description: String(resolved.size),
        expanded: true,
      },
      {
        id: "unresolved",
        label: "Not created yet",
        description: String(unresolved.size),
        expanded: unresolved.size > 0,
      },
      {
        id: "unlinked",
        label: "Unlinked mentions",
        expanded: false,
      },
    ];
  }

  async children(node: TreeNode): Promise<TreeNode[]> {
    if (!this.note) {
      return [];
    }
    if (node.id === "links") {
      return this.linkNodes();
    }
    if (node.id === "unresolved") {
      return this.unresolvedNodes();
    }
    if (node.id === "unlinked") {
      return this.unlinkedFileNodes();
    }
    if (node.id.startsWith("unlinked:")) {
      const lines = this.lines.get(node.id) ?? [];
      return lines.map((line) => ({
        id: `${node.id}:${line.offset}`,
        label: line.text,
        tooltip: line.text,
        command: {
          id: OPEN_COMMAND,
          args: [this.note!.uri, line.offset],
        },
      }));
    }
    return [];
  }

  private linkNodes(): TreeNode[] {
    const { path, vault } = this.note!;
    return [...vault.index.resolvedLinks(path)]
      .sort(([a], [b]) => compareOutgoingPaths(a, b))
      .map(([target, count]) => {
        const uri = vault.index.file(target)?.uri ?? target;
        return {
          id: `links:${target}`,
          label: stemOf(target),
          description: countText(folderOf(target), count),
          resourceUri: uri,
          command: { id: OPEN_COMMAND, args: [uri] },
        };
      });
  }

  private unresolvedNodes(): TreeNode[] {
    const { path, vault } = this.note!;
    return [...vault.index.unresolvedLinks(path)]
      .sort(([a], [b]) => compareOutgoingPaths(a, b))
      .map(([linkpath, count]) => ({
        id: `unresolved:${linkpath}`,
        label: linkpath,
        description: countText("", count),
        icon: "circle-slash",
        tooltip: "No note has this name yet. Click to create it.",
        command: {
          id: CREATE_COMMAND,
          args: [this.note!.uri, linkpath],
        },
      }));
  }

  private async unlinkedFileNodes(): Promise<TreeNode[]> {
    let paths = this.unlinkedPaths;
    if (!paths) {
      paths = this.computeUnlinked();
      this.unlinkedPaths = paths;
    }
    return (await paths).map((path) => {
      const id = `unlinked:${path}`;
      const uri = this.note!.vault.index.file(path)?.uri ?? path;
      return {
        id,
        label: stemOf(path),
        description:
          `${folderOf(path)}  ${this.lines.get(id)?.length ?? 0}`.trim(),
        resourceUri: uri,
        command: { id: OPEN_COMMAND, args: [uri] },
        expanded: false,
      };
    });
  }

  /**
   * Other vault notes whose basename/aliases appear as whole words in this
   * note outside any link (Obsidian Outgoing → Unlinked mentions). Scans the
   * active note once; skips notes already linked from here.
   */
  private async computeUnlinked(): Promise<string[]> {
    const note = this.note!;
    const { index } = note.vault;
    const text = await this.vaults.text(note.uri);
    const linked = new Set(index.resolvedLinks(note.path).keys());
    const paths: string[] = [];
    for (const file of index.files()) {
      const isCandidate =
        file.extension === "md" &&
        !file.excluded &&
        file.path !== note.path &&
        !linked.has(file.path);
      if (!isCandidate) {
        continue;
      }
      const names = [
        stemOf(file.path),
        ...(index.metadata(file.path)?.aliases ?? []),
      ];
      const found = unlinkedLines(text, names);
      if (found.length > 0) {
        this.lines.set(`unlinked:${file.path}`, found);
        paths.push(file.path);
      }
    }
    return sortOutgoingPaths(paths);
  }
}

function countText(folder: string, count: number): string {
  return [folder, count > 1 ? `×${count}` : ""].filter(Boolean).join("  ");
}

/** Obsidian outgoing default alphabetical sort (basename, then path). */
export function compareOutgoingPaths(a: string, b: string): number {
  return (
    stemOf(a).localeCompare(stemOf(b), undefined, { sensitivity: "base" }) ||
    a.localeCompare(b)
  );
}

export function sortOutgoingPaths(paths: readonly string[]): string[] {
  return [...paths].sort(compareOutgoingPaths);
}
