import type { Extension, EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import type { EditorView, WidgetType } from "@codemirror/view";
import type { Disposer } from "../../kernel";
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
   * the source, and mark the source lines with this class, as Obsidian
   * does for block math.
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
declare module "../../kernel/types" {
  interface Services {
    livePreview: LivePreview;
  }
}
