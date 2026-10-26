import type { Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
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

function canStartHeading(doc: Text, start: number): boolean {
  const line = doc.lineAt(start);
  if (/^ {0,3}#/.test(line.text)) {
    return true;
  }
  return (
    line.number < doc.lines &&
    line.text.trim().length > 0 &&
    /^ {0,3}(?:=+|-+)\s*$/.test(doc.line(line.number + 1).text)
  );
}

/** The gutter asks about visible lines; it needs no labels or other metadata. */
export function headingFold(
  doc: Text,
  start: number,
  end: number,
  tree?: Tree,
): FoldRange | null {
  if (!canStartHeading(doc, start)) {
    return null;
  }
  let cache = folds.get(doc);
  if (!cache) {
    cache = new Map();
    folds.set(doc, cache);
  }
  const cached = cache.get(start);
  if (cached?.end === end) {
    return cached.range;
  }
  const activeTree =
    tree && tree.length >= doc.length ? tree : parseMarkdown(doc);
  let heading: SyntaxNode | undefined;
  activeTree.iterate({
    from: start,
    to: end,
    enter(node) {
      if (heading) {
        return false;
      }
      if (node.from >= start && node.from <= end && headingLevel(node.name)) {
        // A heading inside a list item, quote or callout does not fold, as
        // in Obsidian, which does not count it as the note's heading.
        if (node.node.parent?.name === "Document") {
          heading = node.node;
        }
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
  // The next heading of the same or a higher level ends the section.
  for (let next = heading.nextSibling; next; next = next.nextSibling) {
    const nextLevel = headingLevel(next.name);
    if (nextLevel && nextLevel <= level) {
      to = Math.max(heading.to, next.from - 1);
      break;
    }
  }
  return to > heading.to ? { from: heading.to, to } : null;
}
