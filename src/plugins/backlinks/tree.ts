import { folderOf, stemOf } from "../../shared/vault-path";
import type { TreeNode, TreeSource } from "../../shared/runtime";
import type { Vault, Vaults } from "../vault/api";
import { linkedLines, unlinkedLines } from "./mentions";
import type { MentionLine } from "./mentions";

export const OPEN_COMMAND = "markdownWorkbench.backlinks.open";

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

  constructor(private readonly vaults: Vaults) {}

  /** Follow a new active note; `undefined` when no note is active. */
  async setNote(uri: string | undefined): Promise<void> {
    this.files.clear();
    this.lines.clear();
    const located = uri ? await this.vaults.locate(uri) : undefined;
    this.note = located && uri ? { uri, ...located } : undefined;
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
    return lines.map((line) => ({
      id: `${node.id}:${line.offset}`,
      label: line.text,
      tooltip: line.text,
      command: { id: OPEN_COMMAND, args: [uri, line.offset] },
    }));
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
    for (const path of paths) {
      const text = await this.vaults.text(this.uriOf(path));
      this.lines.set(`linked:${path}`, linkedLines(text, isTarget(path)));
    }
    return paths;
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
    for (const file of index.files()) {
      const isCandidate =
        file.extension === "md" &&
        !file.excluded &&
        file.path !== note.path &&
        !linked.has(file.path);
      if (!isCandidate) {
        continue;
      }
      const lines = unlinkedLines(await this.vaults.text(file.uri), names);
      if (lines.length > 0) {
        this.lines.set(`unlinked:${file.path}`, lines);
        paths.push(file.path);
      }
    }
    return paths;
  }

  private uriOf(path: string): string {
    return this.note!.vault.index.file(path)?.uri ?? path;
  }
}
