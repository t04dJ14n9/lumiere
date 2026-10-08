import type { EditorView } from "@codemirror/view";
type Element = EditorView["dom"];
import type { Disposer } from "../../kernel";
export interface RenderPass {
  source: string;
  container: Element;
  sourceLine: number;
  ancestry: readonly string[];
  renderKey: string;
  measure(): void;
  onDispose(dispose: Disposer): void;
  dispose(): Promise<void>;
}
export interface RenderService {
  into(
    container: Element,
    source: string,
    context?: { measure?: () => void; sourceLine?: number; ancestry?: readonly string[] },
  ): Promise<RenderPass>;
}
export interface Fence {
  language: string;
  source: string;
  element: Element;
}
declare module "../../kernel/types" {
  interface Services {
    render: RenderService;
  }
  interface Events {
    /** @mode bail */ "render/fence": (fence: Fence, pass: RenderPass) => true | undefined;
    /** @mode serial */ "render/postProcess": (pass: RenderPass) => void | Promise<void>;
  }
}
