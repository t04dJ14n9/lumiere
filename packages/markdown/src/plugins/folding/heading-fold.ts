import type { Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { parseMarkdown } from "../../markdown/dialect";

interface FoldRange {
  from: number;
  to: number;
}
interface CachedFold {
  end: number;
  range: FoldRange | null;
}
const folds = new WeakMap<Text, Map<number, CachedFold>>();
const headingLevel = (name: string) =>
  Number(/^(?:ATX|Setext)Heading([1-6])$/.exec(name)?.[1] ?? 0);

/** The gutter asks about visible lines; it needs no labels or other metadata. */
export function headingFold(
  doc: Text,
  start: number,
  end: number,
): FoldRange | null {
  let cache = folds.get(doc);
  if (!cache) {
    cache = new Map();
    folds.set(doc, cache);
  }
  const cached = cache.get(start);
  if (cached?.end === end) {
    return cached.range;
  }
  let heading: SyntaxNode | undefined;
  parseMarkdown(doc).iterate({
    from: start,
    to: end,
    enter(node) {
      if (heading) {
        return false;
      }
      if (node.from >= start && node.from <= end && headingLevel(node.name)) {
        heading = node.node;
        return false;
      }
      return undefined;
    },
  });
  const range = heading ? sectionFold(heading, doc.length) : null;
  cache.set(start, { end, range });
  return range;
}

function sectionFold(heading: SyntaxNode, length: number): FoldRange | null {
  const level = headingLevel(heading.name);
  let to = heading.parent?.to ?? length;
  // Only sibling headings end this section. A heading inside a quote or list
  // has its own scope, matching metadata's heading-fold semantics.
  for (let next = heading.nextSibling; next; next = next.nextSibling) {
    const nextLevel = headingLevel(next.name);
    if (nextLevel && nextLevel <= level) {
      to = Math.max(heading.to, next.from - 1);
      break;
    }
  }
  return to > heading.to ? { from: heading.to, to } : null;
}
