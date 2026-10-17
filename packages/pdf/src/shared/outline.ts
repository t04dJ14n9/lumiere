import type { OutlineItem } from "./messages";

/**
 * The last bookmark destination at or before the reading position. Destinations
 * need not be in page order; at identical destinations the deeper heading wins.
 * Entries without a local destination only group their children.
 */
export function findActiveOutlineItem(
  items: readonly OutlineItem[],
  position: { page: number; top?: number },
): OutlineItem | undefined {
  let active: OutlineItem | undefined;
  let activeDepth = -1;
  const visit = (nodes: readonly OutlineItem[], depth: number): void => {
    for (const item of nodes) {
      const top = item.top ?? 0;
      if (
        item.page !== undefined &&
        (item.page < position.page ||
          (item.page === position.page && top <= (position.top ?? 0)))
      ) {
        if (
          !active ||
          item.page > active.page! ||
          (item.page === active.page &&
            (top > (active.top ?? 0) ||
              (top === (active.top ?? 0) && depth >= activeDepth)))
        ) {
          active = item;
          activeDepth = depth;
        }
      }
      visit(item.children, depth + 1);
    }
  };
  visit(items, 0);
  return active;
}
