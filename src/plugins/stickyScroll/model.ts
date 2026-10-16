import { StateField, type Text } from "@codemirror/state";
import { parseMarkdown } from "../../markdown/dialect";
import {
  extractHeadings,
  type Heading,
} from "../../markdown/metadata/heading-extract";

/** Container-local headings in quotes and lists do not define note sections. */
export function sectionHeadings(doc: Text): readonly Heading[] {
  const tree = parseMarkdown(doc);
  const sections = new Set<number>();
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (/^(?:ATX|Setext)Heading[1-6]$/.test(node.name)) {
      sections.add(node.from);
    }
  }
  return extractHeadings(doc.toString(), tree)
    .filter((heading) => sections.has(heading.from))
    .map((heading) => {
      // The shared label extractor retains bare ATX marks for an empty heading.
      const source = doc.sliceString(heading.from, heading.to);
      return /^#{1,6}(?:\s+#+)?\s*$/.test(source)
        ? { ...heading, label: "" }
        : heading;
    });
}

/** Ancestors of the first visible block, excluding a heading still on screen. */
export function stickyHeadings(
  headings: readonly Heading[],
  position: number,
  maxLines: number,
): readonly Heading[] {
  const ancestors = headings.filter(
    (heading) => heading.to < position && position <= heading.end,
  );
  const limit = Math.max(0, Math.floor(maxLines));
  return limit === 0 ? [] : ancestors.slice(-limit);
}

export const headingIndex = StateField.define<readonly Heading[]>({
  create: (state) => sectionHeadings(state.doc),
  update: (headings, transaction) =>
    transaction.docChanged ? sectionHeadings(transaction.newDoc) : headings,
});
