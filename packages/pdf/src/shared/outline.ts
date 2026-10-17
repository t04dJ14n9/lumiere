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
  let active: Candidate | undefined;
  const visit = (nodes: readonly OutlineItem[], depth: number): void => {
    for (const item of nodes) {
      const candidate =
        item.page === undefined
          ? undefined
          : { item, page: item.page, top: item.top ?? 0, depth };
      if (
        candidate &&
        reached(candidate, position) &&
        (!active || laterThan(candidate, active))
      ) {
        active = candidate;
      }
      visit(item.children, depth + 1);
    }
  };
  visit(items, 0);
  return active?.item;
}

interface Candidate {
  item: OutlineItem;
  page: number;
  top: number;
  depth: number;
}

/** At or before the reading position. */
function reached(
  candidate: Candidate,
  position: { page: number; top?: number },
): boolean {
  return (
    candidate.page < position.page ||
    (candidate.page === position.page && candidate.top <= (position.top ?? 0))
  );
}

/** Further on than `active`; at the same destination, as deep or deeper. */
function laterThan(candidate: Candidate, active: Candidate): boolean {
  if (candidate.page !== active.page) {
    return candidate.page > active.page;
  }
  if (candidate.top !== active.top) {
    return candidate.top > active.top;
  }
  return candidate.depth >= active.depth;
}
