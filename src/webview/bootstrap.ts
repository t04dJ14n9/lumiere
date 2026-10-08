import { featureController } from "./features";
import type { Infer } from "../kernel";
import type { viewState } from "../plugins/editor/protocol";
import { Context } from "../kernel";
import type { Endpoint } from "../shared/rpc/endpoint";
import { protocol } from "../plugins/editor/protocol";
import {
  documentWebview,
  editorWebview,
  dialectWebview,
  commandsWebview,
  livePreviewWebview,
  renderWebview,
  resourcesWebview,
} from "../plugins/webview";
export async function bootstrap(
  rpc: Endpoint,
  parent: HTMLElement,
  presentation: {
    saved?: unknown;
    persist?: (state: Infer<typeof viewState>) => void;
  } = {},
) {
  const init = await rpc.call(protocol, "ready", {}),
    root = Context.create();
  root.provide("rpc", rpc);
  root.plugin(documentWebview, init);
  root.plugin(dialectWebview);
  root.plugin(editorWebview, {
    ...init,
    parent,
    ...presentation,
    mode: init.preset === "minimal" ? "source" : init.mode,
  });
  root.plugin(commandsWebview);
  if (init.preset === "obsidian") {
    root.plugin(resourcesWebview);
    root.plugin(renderWebview, { trusted: init.trusted });
    root.plugin(livePreviewWebview, { mode: init.mode });
  }
  const configure = featureController(root);
  root.effect(() =>
    rpc.on(protocol, "configure", (settings) => {
      void configure(settings).catch((error) =>
        root.logger.error("Feature settings failed", error),
      );
    }),
  );
  await configure(init.features, init.preset === "obsidian");
  await root.settled();
  const failed = [...root.runtime.fibers].find(
    (fiber) => fiber.state === "failed",
  );
  if (failed) throw failed.error;
  return root;
}
