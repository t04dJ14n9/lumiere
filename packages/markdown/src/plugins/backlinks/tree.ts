import { folderOf, stemOf } from "../../shared/vault-path";
import type { TreeNode, TreeSource } from "../../shared/host";
import type { Vault, Vaults } from "../vault/api";
import { linkedLines, unlinkedLines } from "../../markdown/mentions";
import { contributionId } from "../../shared/setting-schema";
import type { MentionLine } from "../../markdown/mentions";

export const VIEW_ID = contributionId("backlinks");
export const OPEN_COMMAND = contributionId("backlinks.open");
export const EXTRA_CONTEXT_SETTING = "backlinks.extraContext";
export const EXTRA_CONTEXT_CONTEXT = `${VIEW_ID}.extraContext`;
export const ENABLE_EXTRA_CONTEXT = `${VIEW_ID}.enableExtraContext`;
export const DISABLE_EXTRA_CONTEXT = `${VIEW_ID}.disableExtraContext`;

/** Obsidian BacklinkView.sortOrder values we can honour (vault index has mtime, not ctime). */
export const SORT_ORDERS = [
  "alphabetical",
  "alphabeticalReverse",
  "byModifiedTime",
  "byModifiedTimeReverse",
] as const;
export type BacklinkSortOrder = (typeof SORT_ORDERS)[number];

export const SORT_SETTING = "backlinks.sortOrder";
export const SORT_ALPHABETICAL_CONTEXT = `${VIEW_ID}.sortAlphabetical`;
export const SORT_ALPHABETICAL_REVERSE_CONTEXT = `${VIEW_ID}.sortAlphabeticalReverse`;
export const SORT_MODIFIED_CONTEXT = `${VIEW_ID}.sortByModifiedTime`;
export const SORT_MODIFIED_REVERSE_CONTEXT = `${VIEW_ID}.sortByModifiedTimeReverse`;

export const SORT_BY_ALPHABETICAL = `${VIEW_ID}.sortByAlphabetical`;
export const SORT_BY_ALPHABETICAL_REVERSE = `${VIEW_ID}.sortByAlphabeticalReverse`;
export const SORT_BY_MODIFIED = `${VIEW_ID}.sortByModifiedTime`;
export const SORT_BY_MODIFIED_REVERSE = `${VIEW_ID}.sortByModifiedTimeReverse`;

/** Checked label cycles forward through Obsidian's sort orders. */
export const NEXT_SORT: Record<BacklinkSortOrder, BacklinkSortOrder> = {
  alphabetical: "alphabeticalReverse",
  alphabeticalReverse: "byModifiedTime",
  byModifiedTime: "byModifiedTimeReverse",
  byModifiedTimeReverse: "alphabetical",
};

interface Note {
  uri: string;
  path: string;
  vault: Vault;
}

type Group = "linked" | "unlinked";

/**
 * The Backlinks view for the active note: notes that link to it, each with
 * the lines that do, and on request the notes that mention it without a link.
 */
export class BacklinksTree implements TreeSource {
  private note?: Note;
  /** Files and lines under each group, computed when first expanded. */
  private readonly files = new Map<Group, Promise<string[]>>();
  private readonly lines = new Map<string, MentionLine[]>();

  constructor(
    private readonly vaults: Vaults,
    private readonly sortOrder: () => BacklinkSortOrder = () => "alphabetical",
    private readonly extraContext: () => boolean = () => false,
  ) {}

  /** Follow a new active note; `undefined` when no note is active. */
  async setNote(uri: string | undefined): Promise<void> {
    this.files.clear();
    this.lines.clear();
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

  /** Notes linking to the active note, for the status bar. */
  linkedCount(): number {
    return this.note
      ? this.note.vault.index.backlinks(this.note.path).length
      : 0;
  }

  roots(): TreeNode[] {
    if (!this.note) {
      return [];
    }
    return [
      {
        id: "linked",
        label: "Linked mentions",
        description: String(this.linkedCount()),
        expanded: true,
      },
      { id: "unlinked", label: "Unlinked mentions", expanded: false },
    ];
  }

  async children(node: TreeNode): Promise<TreeNode[]> {
    if (node.id === "linked" || node.id === "unlinked") {
      return this.fileNodes(node.id);
    }
    const lines = this.lines.get(node.id) ?? [];
    const uri = this.uriOf(node.id.slice(node.id.indexOf(":") + 1));
    return lines.flatMap((line) => mentionNodes(node.id, uri, line));
  }

  private async fileNodes(group: Group): Promise<TreeNode[]> {
    let files = this.files.get(group);
    if (!files) {
      files = group === "linked" ? this.linkedFiles() : this.unlinkedFiles();
      this.files.set(group, files);
    }
    return (await files).map((path) => {
      const id = `${group}:${path}`;
      return {
        id,
        label: stemOf(path),
        description:
          `${folderOf(path)}  ${this.lines.get(id)?.length ?? 0}`.trim(),
        resourceUri: this.uriOf(path),
        expanded: false,
      };
    });
  }

  private async linkedFiles(): Promise<string[]> {
    const note = this.note!;
    const { index } = note.vault;
    const isTarget = (source: string) => (linkpath: string) =>
      index.resolveLink(linkpath, source)?.path === note.path;
    const paths = index.backlinks(note.path).map((link) => link.path);
    const options = { extraContext: this.extraContext() };
    for (const path of paths) {
      const text = await this.vaults.text(this.uriOf(path));
      this.lines.set(
        `linked:${path}`,
        linkedLines(text, isTarget(path), options),
      );
    }
    return this.sorted(paths);
  }

  private async unlinkedFiles(): Promise<string[]> {
    const note = this.note!;
    const { index } = note.vault;
    const names = [
      stemOf(note.path),
      ...(index.metadata(note.path)?.aliases ?? []),
    ];
    const linked = new Set(index.backlinks(note.path).map((link) => link.path));
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
      const lines = unlinkedLines(
        await this.vaults.text(file.uri),
        names,
        options,
      );
      if (lines.length > 0) {
        this.lines.set(`unlinked:${file.path}`, lines);
        paths.push(file.path);
      }
    }
    return this.sorted(paths);
  }

  private sorted(paths: readonly string[]): string[] {
    const note = this.note!;
    return sortBacklinkPaths(
      paths,
      this.sortOrder(),
      (path) => note.vault.index.file(path)?.mtime ?? 0,
    );
  }

  private uriOf(path: string): string {
    return this.note!.vault.index.file(path)?.uri ?? path;
  }
}

export function parseSortOrder(value: unknown): BacklinkSortOrder {
  return SORT_ORDERS.includes(value as BacklinkSortOrder)
    ? (value as BacklinkSortOrder)
    : "alphabetical";
}

/** Obsidian backlinks sortOrder (file name / modified time). */
export function sortBacklinkPaths(
  paths: readonly string[],
  order: BacklinkSortOrder = "alphabetical",
  mtimeOf: (path: string) => number = () => 0,
): string[] {
  const byName = (a: string, b: string) =>
    stemOf(a).localeCompare(stemOf(b), undefined, { sensitivity: "base" }) ||
    a.localeCompare(b);
  switch (order) {
    case "alphabetical":
      return [...paths].sort(byName);
    case "alphabeticalReverse":
      return [...paths].sort((a, b) => byName(b, a));
    case "byModifiedTime":
      // Obsidian labelSortNewToOld: newer mtime first, then name.
      return [...paths].sort((a, b) => mtimeOf(b) - mtimeOf(a) || byName(a, b));
    case "byModifiedTimeReverse":
      return [...paths].sort((a, b) => mtimeOf(a) - mtimeOf(b) || byName(a, b));
  }
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
