import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
  type Transaction,
} from "@codemirror/state";
import type { SyntaxNodeRef, Tree } from "@lezer/common";
import type { EditorView, WidgetType } from "@codemirror/view";
import type { Disposer } from "@workshop/core";
import { parseMarkdown } from "../../markdown/dialect/parser";
import { DocumentParse } from "./document-parse";
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
 * How much of a large note we parse before the first paint: the opening
 * viewport and a margin, so its decorations do not wait on the whole note.
 * `documentTreeParser` parses further as the viewport moves and finishes the
 * rest in idle slices.
 */
export const FIRST_PAINT_PARSE_CHARS = 10000;

/** Swap in a further-parsed (or rebuilt) tree of the same document. */
export const replaceDocumentTree = StateEffect.define<Tree>();

/** The opening band of a large note (whole blocks); all of a small one. */
export function parseForFirstPaint(
  doc: Text,
  budget = FIRST_PAINT_PARSE_CHARS,
): Tree {
  if (doc.length <= budget) {
    return parseMarkdown(doc);
  }
  return new DocumentParse(doc).coverTo(budget);
}

/**
 * Parse again only what the edit touched. A complete tree stays complete; a
 * prefix stays the same prefix, so typing in a large note that is still
 * parsing never parses the rest of it.
 */
function updateDocumentTree(tree: Tree, transaction: Transaction): Tree {
  const { changes, newDoc } = transaction;
  const startDoc = transaction.startState.doc;
  const fragments = DocumentParse.from(startDoc, tree).fragmentsAfter(
    changes,
    newDoc,
  );
  const upto =
    tree.length >= startDoc.length
      ? newDoc.length
      : changes.mapPos(tree.length, 1);
  return new DocumentParse(newDoc, fragments).coverTo(upto);
}

/**
 * Live Preview's syntax tree: the whole note, or while a large note is still
 * parsing, a prefix that covers at least the viewport. Reuses unchanged
 * syntax across edits without making distant headings or footnotes
 * viewport-dependent once complete.
 */
export const documentTree = StateField.define<Tree>({
  create: (state) => parseForFirstPaint(state.doc),
  update(tree, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(replaceDocumentTree)) {
        return effect.value;
      }
    }
    return transaction.docChanged
      ? updateDocumentTree(tree, transaction)
      : tree;
  },
});
