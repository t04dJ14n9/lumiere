import type { Disposer } from "../../kernel";
import type { Cancellation } from "../../shared/rpc/lifecycle";
export type ProcessorResult =
  | { markdown: string; html?: never }
  | { html: string; markdown?: never };
export interface CodeProcessor {
  language: string;
  isAvailable?(editorId: string): boolean;
  render(
    source: string,
    context: { uri: string; sourceLine: number },
    token: Cancellation,
  ): ProcessorResult | Promise<ProcessorResult>;
}
export interface CodeBlocks {
  register(processor: CodeProcessor): Disposer;
}
declare module "../../kernel/types" {
  interface Services {
    codeBlocks: CodeBlocks;
  }
}
