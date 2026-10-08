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
  revealed(from: number, to: number): boolean;
  mark(
    from: number,
    to: number,
    cls: string,
    attributes?: Record<string, string>,
  ): void;
  hide(from: number, to: number): void;
  replace(from: number, to: number, widget: WidgetType): void;
  line(at: number, cls: string): void;
}
export interface InlineRenderer {
  nodes: readonly string[];
  decorate(node: SyntaxNodeRef, context: InlineContext): void;
}
export interface BlockRenderer {
  kind: string;
  match(node: SyntaxNodeRef, state: EditorState): boolean;
  editing: "reveal" | "widget";
  showSource?(state: EditorState, block: RenderBlock): boolean;
  range?(node: SyntaxNodeRef, state: EditorState): { from: number; to: number };
  widget(block: RenderBlock): WidgetType;
  estimatedHeight?: number;
}
export interface LivePreview {
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
