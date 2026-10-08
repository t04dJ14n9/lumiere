import type { Disposer } from "../../kernel";
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
    readOnly: context.readOnly,
    documentUri: context.documentUri,
    documentText: context.documentText,
    taskLineCount: context.taskLineCount,
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
