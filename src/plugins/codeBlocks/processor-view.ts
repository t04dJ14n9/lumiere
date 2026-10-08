import type { Context } from "../../kernel";
import type { Fence, RenderPass } from "../render/api";
import type {} from "../editor/api";
import { CancelToken } from "../../shared/rpc/lifecycle";
import { protocol } from "./protocol";
import { ProcessorClient } from "./processor-client";
export function registerProcessors(ctx: Context): void {
  const client = new ProcessorClient(ctx.rpc);
  const stops = new Set<() => void>();
  let live = true;
  const receive = (value: Parameters<ProcessorClient["configure"]>[0]) => {
    if (!live) {
      return;
    }
    client.configure(value);
    ctx.emit("render/changed");
  };
  ctx.effect(() => () => {
    live = false;
    client.clear();
    for (const stop of stops) {
      stop();
    }
    stops.clear();
  });
  ctx.effect(() => ctx.rpc.on(protocol, "changed", receive));
  void ctx.rpc
    .call(protocol, "current", {})
    .then(receive)
    .catch((error) => {
      if (live) {
        ctx.logger.warn("Code processors unavailable", error);
      }
    });
  ctx.on("render/fence", (fence, pass) => {
    if (!client.accepts(fence.language)) {
      return undefined;
    }
    const stop = processFence(ctx, client, fence, pass);
    stops.add(stop);
    pass.onDispose(() => {
      stop();
      stops.delete(stop);
    });
    return true;
  });
}
function processFence(
  ctx: Context,
  client: ProcessorClient,
  fence: Fence,
  pass: RenderPass,
): () => void {
  const token = new CancelToken();
  const container = fence.element.ownerDocument.createElement("div");
  container.className = "md-processed-code";
  fence.element.replaceWith(container);
  const uri = pass.documentUri ?? ctx.editor.source;
  const key = `processor:${fence.language}:${fence.source}`;
  if (pass.ancestry.includes(key) || pass.ancestry.length >= 8) {
    container.textContent = "Code processor recursion limit";
    return () => token.cancel();
  }
  let rendered: RenderPass | undefined;
  container.textContent = "Rendering…";
  void client
    .render(
      {
        language: fence.language,
        source: fence.source,
        uri,
        sourceLine: pass.sourceLine,
      },
      token,
    )
    .then(async (value) => {
      if (token.cancelled) {
        return;
      }
      // All returned HTML passes through the same sanitizer and resource policy as note content.
      rendered = await ctx.render.into(
        container,
        value.markdown ?? value.html,
        {
          readOnly: true,
          documentUri: uri,
          sourceLine: pass.sourceLine,
          ancestry: [...pass.ancestry, key],
          measure: pass.measure,
        },
      );
      if (token.cancelled) {
        await rendered.dispose();
      }
    })
    .catch((error) => {
      if (!token.cancelled) {
        container.textContent = `Code rendering failed: ${String(error)}`;
        pass.measure();
      }
    });
  return () => {
    token.cancel();
    void rendered?.dispose();
  };
}
