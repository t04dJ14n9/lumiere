import type { TreeNode, TreeSource } from "../../shared/host";
import { folderOf, stemOf } from "../../shared/vault-path";
import { contributionId } from "../../shared/setting-schema";
import type { Vault, Vaults } from "../vault/api";
import { unlinkedLines } from "../../markdown/mentions";
import type { MentionLine } from "../../markdown/mentions";

export const VIEW_ID = contributionId("outgoingLinks");
export const OPEN_COMMAND = contributionId("outgoingLinks.open");
export const EXTRA_CONTEXT_SETTING = "outgoingLinks.extraContext";
export const EXTRA_CONTEXT_CONTEXT = `${VIEW_ID}.extraContext`;
export const ENABLE_EXTRA_CONTEXT = `${VIEW_ID}.enableExtraContext`;
export const DISABLE_EXTRA_CONTEXT = `${VIEW_ID}.disableExtraContext`;
/** Create and open a note for an unresolved outbound linkpath. */
export const CREATE_COMMAND = contributionId("outgoingLinks.create");

/** Obsidian OutgoingLink sortOrder values we can honour (index has mtime, not ctime). */
export const SORT_ORDERS = [
  "alphabetical",
  "alphabeticalReverse",
  "byModifiedTime",
  "byModifiedTimeReverse",
] as const;
export type OutgoingSortOrder = (typeof SORT_ORDERS)[number];

export const SORT_SETTING = "outgoingLinks.sortOrder";
export const SORT_ALPHABETICAL_CONTEXT = `${VIEW_ID}.sortAlphabetical`;
export const SORT_ALPHABETICAL_REVERSE_CONTEXT = `${VIEW_ID}.sortAlphabeticalReverse`;
export const SORT_MODIFIED_CONTEXT = `${VIEW_ID}.sortByModifiedTime`;
export const SORT_MODIFIED_REVERSE_CONTEXT = `${VIEW_ID}.sortByModifiedTimeReverse`;

export const SORT_BY_ALPHABETICAL = `${VIEW_ID}.sortByAlphabetical`;
export const SORT_BY_ALPHABETICAL_REVERSE = `${VIEW_ID}.sortByAlphabeticalReverse`;
export const SORT_BY_MODIFIED = `${VIEW_ID}.sortByModifiedTime`;
export const SORT_BY_MODIFIED_REVERSE = `${VIEW_ID}.sortByModifiedTimeReverse`;

/** Checked label cycles forward through Obsidian's sort orders. */
export const NEXT_SORT: Record<OutgoingSortOrder, OutgoingSortOrder> = {
  alphabetical: "alphabeticalReverse",
  alphabeticalReverse: "byModifiedTime",
  byModifiedTime: "byModifiedTimeReverse",
  byModifiedTimeReverse: "alphabetical",
};

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

  constructor(
    private readonly vaults: Vaults,
    private readonly sortOrder: () => OutgoingSortOrder = () => "alphabetical",
    private readonly extraContext: () => boolean = () => false,
  ) {}

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
      return lines.flatMap((line) =>
        mentionNodes(node.id, this.note!.uri, line),
      );
    }
    return [];
  }

  private linkNodes(): TreeNode[] {
    const { path, vault } = this.note!;
    const mtimeOf = (p: string) => vault.index.file(p)?.mtime ?? 0;
    return [...vault.index.resolvedLinks(path)]
      .sort(([a], [b]) => compareOutgoingPaths(a, b, this.sortOrder(), mtimeOf))
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
      .sort(([a], [b]) => compareOutgoingPaths(a, b, this.sortOrder(), () => 0))
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
    const options = { extraContext: this.extraContext() };
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
      const found = unlinkedLines(text, names, options);
      if (found.length > 0) {
        this.lines.set(`unlinked:${file.path}`, found);
        paths.push(file.path);
      }
    }
    return sortOutgoingPaths(
      paths,
      this.sortOrder(),
      (path) => index.file(path)?.mtime ?? 0,
    );
  }
}

function countText(folder: string, count: number): string {
  return [folder, count > 1 ? `×${count}` : ""].filter(Boolean).join("  ");
}

export function parseSortOrder(value: unknown): OutgoingSortOrder {
  return SORT_ORDERS.includes(value as OutgoingSortOrder)
    ? (value as OutgoingSortOrder)
    : "alphabetical";
}

/** Obsidian outgoing alphabetical basename compare (default sortOrder). */
export function compareOutgoingPaths(
  a: string,
  b: string,
  order: OutgoingSortOrder = "alphabetical",
  mtimeOf: (path: string) => number = () => 0,
): number {
  const byName =
    stemOf(a).localeCompare(stemOf(b), undefined, { sensitivity: "base" }) ||
    a.localeCompare(b);
  switch (order) {
    case "alphabetical":
      return byName;
    case "alphabeticalReverse":
      return -byName;
    case "byModifiedTime":
      return mtimeOf(b) - mtimeOf(a) || byName;
    case "byModifiedTimeReverse":
      return mtimeOf(a) - mtimeOf(b) || byName;
  }
}

export function sortOutgoingPaths(
  paths: readonly string[],
  order: OutgoingSortOrder = "alphabetical",
  mtimeOf: (path: string) => number = () => 0,
): string[] {
  return [...paths].sort((a, b) => compareOutgoingPaths(a, b, order, mtimeOf));
}

/** Match row plus optional adjacent context rows (Obsidian extraContext). */
export function mentionNodes(
  parentId: string,
  uri: string,
  line: MentionLine,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  if (line.before !== undefined) {
    nodes.push({
      id: `${parentId}:${line.offset}:before`,
      label: line.before,
      tooltip: line.before,
    });
  }
  nodes.push({
    id: `${parentId}:${line.offset}`,
    label: line.text,
    tooltip: line.text,
    command: { id: OPEN_COMMAND, args: [uri, line.offset] },
  });
  if (line.after !== undefined) {
    nodes.push({
      id: `${parentId}:${line.offset}:after`,
      label: line.after,
      tooltip: line.after,
    });
  }
  return nodes;
}
