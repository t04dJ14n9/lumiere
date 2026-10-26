/** Which nodes of a tree view are open: the reader's choice, else the plugin's. */
import type { TreeItem } from "@workshop/host-node/views";

/** Node id → expanded, for the nodes the reader toggled. */
export type Toggled = ReadonlyMap<string, boolean>;

export function isExpanded(item: TreeItem, toggled: Toggled): boolean {
  return toggled.get(item.id) ?? item.expanded ?? false;
}

/** The ids from a root down to (not including) `id`; undefined when it is not in the tree. */
export function ancestors(
  items: readonly TreeItem[],
  id: string,
): readonly string[] | undefined {
  for (const item of items) {
    if (item.id === id) {
      return [];
    }
    const below = item.children && ancestors(item.children, id);
    if (below) {
      return [item.id, ...below];
    }
  }
  return undefined;
}

/** Open every folder on the way to a revealed node, keeping the reader's other choices. */
export function expandTo(toggled: Toggled, path: readonly string[]): Toggled {
  if (path.every((id) => toggled.get(id) === true)) {
    return toggled;
  }
  const next = new Map(toggled);
  for (const id of path) {
    next.set(id, true);
  }
  return next;
}
