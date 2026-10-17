import type { Disposer } from "@workshop/core";
import type { Cancellation } from "../../shared/rpc/lifecycle";
export type ProcessorResult =
  { markdown: string; html?: never } | { html: string; markdown?: never };
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
declare module "@workshop/core" {
  interface Services {
    codeBlocks: CodeBlocks;
  }
}
