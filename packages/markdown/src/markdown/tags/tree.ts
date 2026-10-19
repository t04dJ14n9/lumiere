export interface TagNode {
  key: string;
  tag: string;
  label: string;
  count: number;
  children: TagNode[];
}
/**
 * The vault's tags as Obsidian's Tags pane counts them (measured): every use
 * of a tag counts, and a parent counts each use of its descendants
 * (`#a/b` counts toward `#a`). Case variants merge under the most used
 * spelling (the first seen on a tie). The flat list has every path too,
 * `#a` included when only `#a/b` is written.
 */
export function tagTree(
  notes: readonly { id: string; tags: readonly string[] }[],
  nested: boolean,
  frequency: boolean,
): TagNode[] {
  const nodes = new Map<string, TagNode>();
  for (const [key, entry] of tagUses(notes)) {
    nodes.set(key, {
      key,
      tag: entry.tag,
      label: nested ? entry.tag.split("/").at(-1)! || "/" : entry.tag,
      count: entry.uses,
      children: [],
    });
  }
  const roots: TagNode[] = [];
  for (const [key, node] of nodes) {
    const parent =
      nested && key.includes("/")
        ? nodes.get(key.slice(0, key.lastIndexOf("/")))
        : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (items: TagNode[]): void => {
    items.sort(
      (a, b) =>
        (frequency ? b.count - a.count : 0) || a.label.localeCompare(b.label),
    );
    items.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

interface TagUses {
  /** The most used spelling. */
  tag: string;
  uses: number;
  spellings: Map<string, number>;
}

/** Each tag path's uses, keyed lower-cased, prefixes included. */
function tagUses(
  notes: readonly { tags: readonly string[] }[],
): Map<string, TagUses> {
  const entries = new Map<string, TagUses>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const parts = tag.split("/");
      for (let length = 1; length <= parts.length; length++) {
        const path = parts.slice(0, length).join("/");
        const key = path.toLowerCase();
        let entry = entries.get(key);
        if (!entry) {
          entry = { tag: path, uses: 0, spellings: new Map() };
          entries.set(key, entry);
        }
        entry.uses++;
        const spelled = (entry.spellings.get(path) ?? 0) + 1;
        entry.spellings.set(path, spelled);
        if (spelled > (entry.spellings.get(entry.tag) ?? 0)) {
          entry.tag = path;
        }
      }
    }
  }
  return entries;
}
