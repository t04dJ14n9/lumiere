import type { TreeNode, TreeSource } from "../../shared/runtime";
import { folderOf, stemOf } from "../../shared/vault-path";
import { contributionId } from "../../shared/setting-schema";
import type { Vault, Vaults } from "../vault/api";

export const OPEN_COMMAND = contributionId("outgoingLinks.open");

/**
 * The Outgoing links view for the active note: files it links to, with how
 * often, then links whose note does not exist yet.
 */
export class OutgoingLinksTree implements TreeSource {
  private note?: { path: string; vault: Vault };

  constructor(private readonly vaults: Vaults) {}

  async setNote(uri: string | undefined): Promise<void> {
    const located = uri ? await this.vaults.locate(uri) : undefined;
    if (located) {
      this.note = located;
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
    ];
  }

  children(node: TreeNode): TreeNode[] {
    if (!this.note) {
      return [];
    }
    return node.id === "links" ? this.linkNodes() : this.unresolvedNodes();
  }

  private linkNodes(): TreeNode[] {
    const { path, vault } = this.note!;
    return [...vault.index.resolvedLinks(path)]
      .sort(([a], [b]) => (a < b ? -1 : 1))
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
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([linkpath, count]) => ({
        id: `unresolved:${linkpath}`,
        label: linkpath,
        description: countText("", count),
        icon: "circle-slash",
        tooltip:
          "No note has this name yet. Click the link in the note to create it.",
      }));
  }
}

function countText(folder: string, count: number): string {
  return [folder, count > 1 ? `×${count}` : ""].filter(Boolean).join("  ");
}
