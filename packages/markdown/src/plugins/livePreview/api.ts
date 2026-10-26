import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import {
  TreeFragment,
  type ChangedRange,
  type SyntaxNodeRef,
  type Tree,
} from "@lezer/common";
import type { EditorView, WidgetType } from "@codemirror/view";
import type { Disposer } from "@workshop/core";
import { markdownParser, parseMarkdown } from "../../markdown/dialect/parser";
export interface RenderBlock {
  from: number;
  to: number;
  kind: string;
  source: string;
}
export interface InlineContext {
  state: EditorState;
  /** Inclusive selection touch, extended through inline ancestors and abutting elements. */
  revealed(from: number, to: number): boolean;
  mark(
    from: number,
    to: number,
    cls: string,
    attributes?: Record<string, string>,
  ): void;
  hide(from: number, to: number): void;
  replace(from: number, to: number, widget: WidgetType): void;
  line(at: number, cls: string, attributes?: Record<string, string>): void;
}
export interface InlineRenderer {
  nodes: readonly string[];
  /**
   * Keep these widgets outside the viewport so `estimatedHeight` stays in
   * CodeMirror's height map. Viewport-only inline decorations drop them as
   * soon as they scroll away, which collapses tall `|WxH` embeds to one line.
   */
  persistent?: boolean;
  decorate(node: SyntaxNodeRef, context: InlineContext): void;
}
export interface BlockRenderer {
  kind: string;
  /** Optional complete list of node names that `match` may accept. */
  nodes?: readonly string[];
  match(node: SyntaxNodeRef, state: EditorState): boolean;
  editing: "reveal" | "widget";
  showSource?(state: EditorState, block: RenderBlock): boolean;
  /**
   * While the caret is in a revealed block, keep the rendered result below
   * the source and mark the source lines with this class. Math no longer
   * uses this (BH-009: source only while editing); the hook remains for
   * other block kinds that want an Obsidian-style editing preview.
   */
  editingPreview?: { sourceClass: string };
  range?(node: SyntaxNodeRef, state: EditorState): { from: number; to: number };
  widget(block: RenderBlock): WidgetType;
  estimatedHeight?: number;
}
export interface LivePreview {
  /** Persistent widgets intersecting the source range; source overrides and folds are excluded. */
  renderedWidgets?(
    state: EditorState,
    from: number,
    to: number,
  ): readonly RenderBlock[];
  /** Disjoint folded spans in source order, for source-line motion policy. */
  foldedRanges?(state: EditorState): readonly { from: number; to: number }[];
  verticalPosition?(state: EditorState, direction: -1 | 1): number | undefined;
  /** False where a rendered block hides the source (inline decorations would be misplaced). */
  sourceVisibleAt?(state: EditorState, position: number): boolean;
  visiblePosition?(
    state: EditorState,
    position: number,
  ): { position: number; block: boolean };
  inlineExtensions?(): Extension;
  position?(
    source: string,
    element: EditorView["dom"],
    point: { clientX: number; clientY: number },
  ): number | undefined;
  block(renderer: BlockRenderer): Disposer;
  inline(renderer: InlineRenderer): Disposer;
  readonly mode: "source" | "livePreview";
  setMode(mode: "source" | "livePreview"): void;
}
declare module "@workshop/core" {
  interface Services {
    livePreview: LivePreview;
  }
}

/**
 * How much of a large note we parse before the first paint. Matches the Live
 * Preview hot band (opening viewport + margin) so block/inline decorations for
 * the first screen do not wait on a full-document Lezer walk. A ViewPlugin
 * replaces this with a complete tree on idle / the next frames.
 */
export const FIRST_PAINT_PARSE_CHARS = 10000;

/** Swap in a completed (or otherwise rebuilt) document tree after first paint. */
export const replaceDocumentTree = StateEffect.define<Tree>();

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

function updateDocumentTree(
  tree: Tree,
  startDoc: Text,
  newDoc: Text,
  changes: ChangedRange[],
): Tree {
  if (tree.length < startDoc.length) {
    return parseForFirstPaint(newDoc);
  }
  let fragments = TreeFragment.applyChanges(
    TreeFragment.addTree(tree),
    changes,
  );
  if (changes[0]!.fromA <= startDoc.line(1).to) {
    const end = Math.min(newDoc.length, newDoc.line(1).to + 1);
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
  return parseMarkdown(newDoc, fragments);
}

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
    const changes: ChangedRange[] = [];
    transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      changes.push({ fromA, toA, fromB, toB });
    });
    return updateDocumentTree(
      tree,
      transaction.startState.doc,
      transaction.newDoc,
      changes,
    );
  },
});
