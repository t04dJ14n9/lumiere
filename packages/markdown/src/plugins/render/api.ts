import type { EditorView } from "@codemirror/view";
type Element = EditorView["dom"];
import type { Disposer } from "@workshop/core";
/**
 * Marks an element a fence processor is still filling in (a Mermaid diagram
 * waiting for its SVG). The rendered block around it keeps the height it
 * reserved, and records no height, until no such element is left; the
 * processor calls `measure()` when it removes the mark.
 */
export const RENDER_PENDING_ATTRIBUTE = "data-render-pending";
export interface RenderPass {
  readOnly?: boolean;
  source: string;
  displaySource?: string;
  documentUri?: string;
  documentText?: string;
  taskLineCount?: number;
  container: Element;
  sourceLine: number;
  ancestry: readonly string[];
  renderKey: string;
  measure(): void;
  onDispose(dispose: Disposer): void;
  dispose(): Promise<void>;
}
export interface RenderService {
  readonly trusted?: boolean;
  into(
    container: Element,
    source: string,
    context?: {
      signal?: AbortSignal;
      readOnly?: boolean;
      documentText?: string;
      taskLineCount?: number;
      documentUri?: string;
      measure?: () => void;
      sourceLine?: number;
      ancestry?: readonly string[];
    },
  ): Promise<RenderPass>;
}
export interface Fence {
  language: string;
  source: string;
  element: Element;
}
declare module "@workshop/core" {
  interface Services {
    render: RenderService;
  }
  interface Events {
    /** @mode emit */ "render/changed": () => void;
    /** @mode bail */ "render/fence": (
      fence: Fence,
      pass: RenderPass,
    ) => true | undefined;
    /** @mode serial */ "render/preProcess": (
      pass: RenderPass,
    ) => void | Promise<void>;
    /** @mode serial */ "render/postProcess": (
      pass: RenderPass,
    ) => void | Promise<void>;
  }
}
