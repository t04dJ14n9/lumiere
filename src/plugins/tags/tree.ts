import { tagTree, type TagNode } from "../../markdown/tags/tree";
import type { TreeNode, TreeSource } from "../../shared/runtime";
import { isMarkdownPath } from "../../shared/vault-path";
import type { VaultIndex } from "../vault/api";

export const SEARCH_COMMAND = "markdownWorkbench.tags.search";

export interface TagsViewOptions {
  sort: "name" | "frequency";
  nested: boolean;
}

/**
 * The vault's notes and their tags, as the tag tree takes them. Excluded
 * files are left out, as tag search leaves them out.
 */
export function taggedNotesOf(
  index: VaultIndex,
): { id: string; tags: string[] }[] {
  return index
    .files()
    .filter((file) => !file.excluded && isMarkdownPath(file.path))
    .map((file) => ({
      id: file.path,
      tags: (index.metadata(file.path)?.tags ?? []).map((item) => item.tag),
    }))
    .filter((note) => note.tags.length > 0);
}

/**
 * The Tags view: every tag in the vault, nested by `/` unless turned off.
 * Counts are notes, so a parent counts a note once however many of its
 * descendants the note uses. A click searches for the tag.
 */
export class TagsTree implements TreeSource {
  private root?: string;
  private tree: TagNode[] = [];
  private readonly byId = new Map<string, TagNode>();

  /** Rebuild from the index, or show nothing when no vault applies. */
  update(index: VaultIndex | undefined, options: TagsViewOptions): void {
    this.root = index?.root;
    this.tree = index
      ? tagTree(
          taggedNotesOf(index),
          options.nested,
          options.sort === "frequency",
        )
      : [];
    this.byId.clear();
  }

  get isEmpty(): boolean {
    return this.tree.length === 0;
  }

  roots(): TreeNode[] {
    return this.tree.map((tag) => this.node(tag));
  }

  children(node: TreeNode): TreeNode[] {
    return (this.byId.get(node.id)?.children ?? []).map((tag) =>
      this.node(tag),
    );
  }

  private node(tag: TagNode): TreeNode {
    const id = `tag:${tag.key}`;
    this.byId.set(id, tag);
    return {
      id,
      label: tag.label,
      description: String(tag.count),
      tooltip: `#${tag.tag}`,
      icon: "tag",
      expanded: tag.children.length > 0 ? false : undefined,
      command: { id: SEARCH_COMMAND, args: [this.root, tag.tag] },
    };
  }
}
