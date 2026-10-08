export interface TagNode {
  key: string;
  tag: string;
  label: string;
  count: number;
  children: TagNode[];
}
export function tagTree(
  notes: readonly { id: string; tags: readonly string[] }[],
  nested: boolean,
  frequency: boolean,
): TagNode[] {
  const entries = new Map<
    string,
    { tag: string; notes: Set<string>; explicit: boolean }
  >();
  for (const note of notes) {
    for (const tag of note.tags) {
      const parts = tag.split("/");
      for (let length = 1; length <= parts.length; length++) {
        const path = parts.slice(0, length).join("/");
        const key = path.toLowerCase();
        let entry = entries.get(key);
        if (!entry) {
          entry = { tag: path, notes: new Set(), explicit: false };
          entries.set(key, entry);
        }
        entry.notes.add(note.id);
        entry.explicit ||= length === parts.length;
      }
    }
  }
  const nodes = new Map<string, TagNode>();
  for (const [key, entry] of entries) {
    if (nested || entry.explicit) {
      nodes.set(key, {
        key,
        tag: entry.tag,
        label: nested ? entry.tag.split("/").at(-1)! || "/" : entry.tag,
        count: entry.notes.size,
        children: [],
      });
    }
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
