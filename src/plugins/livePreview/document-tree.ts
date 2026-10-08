import { StateField } from "@codemirror/state";
import { TreeFragment, type ChangedRange, type Tree } from "@lezer/common";
import { parseMarkdown } from "../../markdown/dialect";

/** Reuse unchanged syntax without making distant headings or footnotes viewport-dependent. */
export const documentTree = StateField.define<Tree>({
  create: (state) => parseMarkdown(state.doc),
  update(tree, transaction) {
    if (!transaction.docChanged) {
      return tree;
    }
    const changes: ChangedRange[] = [];
    transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      changes.push({ fromA, toA, fromB, toB });
    });
    let fragments = TreeFragment.applyChanges(TreeFragment.addTree(tree), changes);
    if (changes[0]!.fromA <= transaction.startState.doc.line(1).to) {
      // A moved horizontal rule may now open frontmatter. Its meaning depends
      // on being at document start, which reusable Markdown nodes do not track.
      const end = Math.min(transaction.newDoc.length, transaction.newDoc.line(1).to + 1);
      fragments = fragments.flatMap((fragment) =>
        fragment.to <= end
          ? []
          : [
              new TreeFragment(
                Math.max(fragment.from, end),
                fragment.to,
                fragment.tree,
                fragment.offset,
                true,
                fragment.openEnd,
              ),
            ],
      );
    }
    return parseMarkdown(transaction.newDoc, fragments);
  },
});
