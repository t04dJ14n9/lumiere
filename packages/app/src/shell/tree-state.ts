/**
 * Which nodes of a tree are open. In a plugin's tree view, the reader's
 * choice, else the plugin's; in the file list, the folders the reader opened
 * and the ones on the way to the shown note.
 */
import type { TreeItem } from "@workshop/host-node/views";
import type { SavedFolders } from "../shared/ui-state";
import { foldersAbove } from "./tree";

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

/**
 * The file list's open folders, by vault-relative path. Every other folder
 * is closed, as in VS Code's Explorer, so a big vault starts short.
 */
export type OpenFolders = ReadonlySet<string>;

export function toggleFolder(open: OpenFolders, path: string): OpenFolders {
  const next = new Set(open);
  if (!next.delete(path)) {
    next.add(path);
  }
  return next;
}

/** Open the folders that hold a file, so it shows; the same set when they are open. */
export function revealFile(open: OpenFolders, path: string): OpenFolders {
  const closed = foldersAbove(path).filter((folder) => !open.has(folder));
  return closed.length > 0 ? new Set([...open, ...closed]) : open;
}

/** One vault's open folders, as the saved layout keeps them. */
export function foldersOf(saved: SavedFolders, vault: string): OpenFolders {
  // Own keys only, so a lookup never finds an inherited `constructor`.
  return new Set(Object.hasOwn(saved, vault) ? saved[vault] : []);
}

/** The saved layout's folders with one vault's changed; a vault with none open is left out. */
export function withFolders(
  saved: SavedFolders,
  vault: string,
  open: OpenFolders,
): SavedFolders {
  const others = Object.entries(saved).filter(([key]) => key !== vault);
  return Object.fromEntries(
    open.size > 0 ? [...others, [vault, [...open].sort()]] : others,
  );
}
