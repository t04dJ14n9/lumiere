import { tagTree, type TagNode } from "../../markdown/tags/tree";
import type { TreeNode, TreeSource } from "../../shared/host";
import { isMarkdownPath } from "../../shared/vault-path";
import { contributionId } from "../../shared/setting-schema";
import type { VaultIndex } from "../vault/api";

export const VIEW_ID = contributionId("tags");
export const SEARCH_COMMAND = contributionId("tags.search");
export const SORT_SETTING = "tags.viewSort";
export const NESTED_SETTING = "tags.viewNested";
export const SORT_FREQUENCY_CONTEXT = `${VIEW_ID}.sortFrequency`;
export const NESTED_CONTEXT = `${VIEW_ID}.nested`;
export const SORT_BY_FREQUENCY = `${VIEW_ID}.sortByFrequency`;
export const SORT_BY_NAME = `${VIEW_ID}.sortByName`;
export const ENABLE_NESTED = `${VIEW_ID}.enableNested`;
export const DISABLE_NESTED = `${VIEW_ID}.disableNested`;

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
 * Counts are uses, as in Obsidian's Tags pane: a parent counts each use of
 * its descendants. A click searches for the tag.
 */
export class TagsTree implements TreeSource {
  private root?: string;
  private tree: TagNode[] = [];
  private readonly byId = new Map<string, TagNode>();

  /** Rebuild from the index, or show nothing when no vault applies. */
  update(index: VaultIndex | undefined, options: TagsViewOptions): void {
    if (index) {
      this.root = index.root;
    } else {
      delete this.root;
    }
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
      ...(tag.children.length > 0 && { expanded: false }),
      command: { id: SEARCH_COMMAND, args: [this.root, tag.tag] },
    };
  }
}
