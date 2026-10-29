import type { TreeNode } from "../../shared/host";

export interface PresentedTreeNode {
  node: TreeNode;
  id: string;
}

/**
 * Tracks desired expansion and gives forced collapses a fresh TreeItem id.
 * VS Code preserves a tree item's expansion state while its id is unchanged.
 */
export class TreeExpansionState {
  private readonly expanded = new Map<string, boolean>();
  private readonly collapseVersions = new Map<string, number>();

  reset(): void {
    this.expanded.clear();
    this.collapseVersions.clear();
  }

  expand(node: TreeNode): void {
    this.expanded.set(node.id, true);
  }

  collapse(node: TreeNode): void {
    this.expanded.set(node.id, false);
    this.collapseVersions.set(node.id, this.nextCollapseVersion(node));
  }

  item(node: TreeNode): PresentedTreeNode {
    const expanded = this.expanded.get(node.id);
    const version = this.collapseVersions.get(node.id);
    return {
      node: expanded === undefined ? node : { ...node, expanded },
      id: version === undefined ? node.id : `${node.id}:collapse-${version}`,
    };
  }

  private nextCollapseVersion(node: TreeNode): number {
    return (this.collapseVersions.get(node.id) ?? 0) + 1;
  }
}
