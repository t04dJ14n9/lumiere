import type { ChangeDesc, Text } from "@codemirror/state";
import { DocInput } from "@codemirror/language";
import {
  Tree,
  TreeFragment,
  type ChangedRange,
  type PartialParse,
} from "@lezer/common";
import {
  cachedMarkdown,
  markdownParser,
  rememberParsedMarkdown,
} from "../../markdown/dialect/parser";

/**
 * The Markdown parse of one version of a document, which can stop part-way,
 * resume where it stopped, and hand its work on to the next version.
 *
 * `tree` covers the document from its start to `tree.length`, the whole of
 * it once complete. `fragments` hold every subtree parsed so far, so
 * resuming, or parsing again after an edit, reuses them (Lezer takes whole
 * top-level blocks from them) instead of starting over from the top.
 */
export class DocumentParse {
  private live: PartialParse | null = null;

  constructor(
    readonly doc: Text,
    private fragments: readonly TreeFragment[] = [],
    private current: Tree = Tree.empty,
  ) {}

  /** Continue from `tree`, which covers `doc` or a prefix of it. */
  static from(
    doc: Text,
    tree: Tree,
    fragments: readonly TreeFragment[] = [],
  ): DocumentParse {
    const isPrefix = tree.length < doc.length;
    return new DocumentParse(
      doc,
      TreeFragment.addTree(tree, fragments, isPrefix),
      tree,
    );
  }

  get tree(): Tree {
    return this.current;
  }

  get isComplete(): boolean {
    return this.covers(this.doc.length);
  }

  /**
   * Parse now until the tree covers `upto`, continuing the parse in progress.
   * A block is never split, so the tree may reach past `upto`.
   */
  coverTo(upto: number): Tree {
    const target = Math.min(upto, this.doc.length);
    if (this.covers(target) || this.adoptCached()) {
      return this.current;
    }
    const parse = this.liveParse();
    if (target < this.doc.length) {
      // A live parse never has a stop of its own (background work runs to
      // the end), so this cannot move one forward, which Lezer forbids.
      parse.stopAt(Math.max(target, parse.parsedPos));
    }
    this.finish(runToEnd(parse));
    return this.current;
  }

  /**
   * Parse toward the end of the document until `deadline`, a
   * `performance.now()` time; at least one block. True once complete.
   */
  work(deadline: number): boolean {
    if (this.isComplete || this.adoptCached()) {
      return true;
    }
    const parse = this.liveParse();
    for (;;) {
      const tree = parse.advance();
      if (tree) {
        this.finish(tree);
        return true;
      }
      if (performance.now() >= deadline) {
        return false;
      }
    }
  }

  /**
   * Fragments for `doc`, this document after `changes`: everything parsed
   * so far, the parse in progress included, less what the changes touched.
   */
  fragmentsAfter(changes: ChangeDesc, doc: Text): readonly TreeFragment[] {
    this.takeProgress();
    const ranges: ChangedRange[] = [];
    changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      ranges.push({ fromA, toA, fromB, toB });
    });
    if (!ranges.length) {
      return this.fragments;
    }
    const fragments = TreeFragment.applyChanges(this.fragments, ranges);
    return ranges[0]!.fromA <= this.doc.line(1).to
      ? afterFirstLine(fragments, doc)
      : fragments;
  }

  private covers(position: number): boolean {
    return this.current !== Tree.empty && this.current.length >= position;
  }

  /** Another reader may already have parsed this exact document. */
  private adoptCached(): boolean {
    const cached = cachedMarkdown(this.doc);
    if (!cached) {
      return false;
    }
    this.live = null;
    this.current = cached;
    this.fragments = TreeFragment.addTree(cached);
    return true;
  }

  private liveParse(): PartialParse {
    this.live ??= markdownParser.startParse(
      new DocInput(this.doc),
      this.fragments,
    );
    return this.live;
  }

  /** Turn the parse in progress into fragments, so an edit does not lose it. */
  private takeProgress(): void {
    const parse = this.live;
    if (!parse || parse.parsedPos <= this.current.length) {
      return;
    }
    parse.stopAt(parse.parsedPos);
    this.finish(runToEnd(parse));
  }

  private finish(tree: Tree): void {
    this.live = null;
    this.current = tree;
    const isComplete = tree.length >= this.doc.length;
    this.fragments = TreeFragment.addTree(tree, this.fragments, !isComplete);
    if (isComplete) {
      rememberParsedMarkdown(this.doc, tree);
    }
  }
}

function runToEnd(parse: PartialParse): Tree {
  for (;;) {
    const tree = parse.advance();
    if (tree) {
      return tree;
    }
  }
}

/**
 * Only the first line can open frontmatter, so an edit there can turn the
 * lines after it into frontmatter or back: parse them again rather than
 * reuse blocks that began after it.
 */
function afterFirstLine(
  fragments: readonly TreeFragment[],
  doc: Text,
): readonly TreeFragment[] {
  const end = Math.min(doc.length, doc.line(1).to + 1);
  return fragments.flatMap((fragment) =>
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
