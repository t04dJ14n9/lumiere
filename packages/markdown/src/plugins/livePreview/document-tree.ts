import { StateEffect, StateField, type Text } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { TreeFragment, type ChangedRange, type Tree } from "@lezer/common";
import { markdownParser, parseMarkdown } from "../../markdown/dialect";
import { VIEWPORT_BLOCK_MARGIN } from "./deferred-block";

/**
 * How much of a large note we parse before the first paint. Matches the Live
 * Preview hot band (opening viewport + margin) so block/inline decorations for
 * the first screen do not wait on a full-document Lezer walk. A ViewPlugin
 * replaces this with a complete tree on idle / the next frames.
 */
export const FIRST_PAINT_PARSE_CHARS = VIEWPORT_BLOCK_MARGIN * 2;

/** Swap in a completed (or otherwise rebuilt) document tree after first paint. */
export const replaceDocumentTree = StateEffect.define<Tree>();

/** Reuse unchanged syntax without making distant headings or footnotes viewport-dependent. */
export const documentTree = StateField.define<Tree>({
  create: (state) => parseForFirstPaint(state.doc),
  update(tree, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(replaceDocumentTree)) {
        return effect.value;
      }
    }
    if (!transaction.docChanged) {
      return tree;
    }
    // Prefix trees are not fragment-safe across arbitrary edits — reparse with
    // the same first-paint budget (idle completer will expand again).
    if (tree.length < transaction.startState.doc.length) {
      return parseForFirstPaint(transaction.newDoc);
    }
    const changes: ChangedRange[] = [];
    transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      changes.push({ fromA, toA, fromB, toB });
    });
    let fragments = TreeFragment.applyChanges(
      TreeFragment.addTree(tree),
      changes,
    );
    if (changes[0]!.fromA <= transaction.startState.doc.line(1).to) {
      // A moved horizontal rule may now open frontmatter. Its meaning depends
      // on being at document start, which reusable Markdown nodes do not track.
      const end = Math.min(
        transaction.newDoc.length,
        transaction.newDoc.line(1).to + 1,
      );
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

/**
 * After the first frame, finish the full-document tree when create() only
 * parsed the opening band. Public CM6 pattern: cheap first paint, then
 * `ensure`-style completion off the critical path.
 */
export const documentTreeCompleter = ViewPlugin.fromClass(
  class {
    private done = false;
    constructor(view: EditorView) {
      // Defer past the first paint frame so full-doc Lezer work cannot contend
      // with glyphs (#289: growing sync first-paint parse regressed TTI).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.schedule(view));
      });
    }
    update(update: ViewUpdate) {
      if (this.done) {
        return;
      }
      if (update.state.field(documentTree).length >= update.state.doc.length) {
        this.done = true;
        return;
      }
      if (update.docChanged) {
        this.schedule(update.view);
      }
    }
    private schedule(view: EditorView) {
      const run = () => {
        if (!view.dom.isConnected || this.done) {
          return;
        }
        const current = view.state.field(documentTree);
        if (current.length >= view.state.doc.length) {
          this.done = true;
          return;
        }
        const full = parseMarkdown(view.state.doc);
        this.done = true;
        view.dispatch({ effects: replaceDocumentTree.of(full) });
      };
      const idle = (
        globalThis as unknown as {
          requestIdleCallback?: (
            cb: () => void,
            opts?: { timeout: number },
          ) => number;
        }
      ).requestIdleCallback;
      if (typeof idle === "function") {
        // After first paint, finish soon — heading reveal via the
        // Frontmatter placeholder waits on a complete fence node.
        idle(run, { timeout: 32 });
      } else {
        requestAnimationFrame(() => requestAnimationFrame(run));
      }
    }
  },
);

/** Parse only the opening band for large notes; full parse otherwise. */
export function parseForFirstPaint(
  doc: Text,
  budget = FIRST_PAINT_PARSE_CHARS,
): Tree {
  if (doc.length <= budget) {
    return parseMarkdown(doc);
  }
  // End on a line boundary so we do not split a block mid-line.
  const at = Math.min(budget, doc.length);
  const line = doc.lineAt(at);
  const end = Math.min(
    doc.length,
    line.number < doc.lines ? line.to + 1 : line.to,
  );
  // Do not use parseMarkdown's Text WeakMap — the prefix string is not the doc.
  return markdownParser.parse(doc.sliceString(0, end));
}
