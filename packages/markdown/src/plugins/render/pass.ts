import type { Disposer } from "@workshop/core";
import type { RenderPass, RenderService } from "./api";

export type RenderContext = NonNullable<Parameters<RenderService["into"]>[2]>;

export function createRenderPass(options: {
  container: RenderPass["container"];
  source: string;
  context: RenderContext;
  passes: Set<RenderPass>;
}): RenderPass {
  const { container, source, context, passes } = options;
  const disposers: Disposer[] = [];
  let isLive = true;
  const pass: RenderPass = {
    source,
    ...(context.readOnly === undefined ? {} : { readOnly: context.readOnly }),
    ...(context.documentUri === undefined
      ? {}
      : { documentUri: context.documentUri }),
    ...(context.documentText === undefined
      ? {}
      : { documentText: context.documentText }),
    ...(context.taskLineCount === undefined
      ? {}
      : { taskLineCount: context.taskLineCount }),
    container,
    sourceLine: context.sourceLine ?? 0,
    ancestry: context.ancestry ?? [],
    renderKey: source,
    measure: context.measure ?? (() => {}),
    onDispose(dispose) {
      if (!isLive) {
        void dispose();
      } else {
        disposers.push(dispose);
      }
    },
    async dispose() {
      if (!isLive) {
        return;
      }
      // Invalidate before awaiting: late async processors must clean up at once.
      isLive = false;
      passes.delete(pass);
      for (const dispose of disposers.reverse()) {
        await dispose();
      }
    },
  };
  passes.add(pass);
  return pass;
}
