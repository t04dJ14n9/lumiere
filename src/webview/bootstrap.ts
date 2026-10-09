import { webviewLogging } from "../plugins/editor/logging";
import { pluginRank } from "../plugins/catalog";
import { pluginReporting } from "./plugin-reporting";
import type { Infer } from "../kernel";
import type { viewState } from "../plugins/editor/protocol";
import { Context } from "../kernel";
import type { Endpoint } from "../shared/rpc/endpoint";
import { protocol } from "../plugins/editor/protocol";
import {
  documentWebview,
  markersWebview,
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
  logging = webviewLogging((record) => rpc.notify(protocol, "log", record)),
) {
  const init = await rpc.call(protocol, "ready", {});
  logging.configure(init.debugLogging);
  const root = Context.create({
    logger: logging.logger,
    rank: pluginRank,
    replaceable: ["resources", "markers"],
  });
  root.provide("rpc", rpc);
  root.effect(() => rpc.on(protocol, "configureLogging", logging.configure));
  root.plugin(documentWebview, init);
  root.plugin(dialectWebview);
  const editor = root.plugin(editorWebview, {
    ...init,
    parent,
    ...presentation,
    mode: init.preset === "minimal" ? "source" : init.mode,
  });
  root.plugin(commandsWebview);
  root.plugin(markersWebview);
  if (init.preset === "obsidian") {
    root.plugin(resourcesWebview);
    root.plugin(renderWebview, { trusted: init.trusted });
    root.plugin(livePreviewWebview, { mode: init.mode });
  }
  let editorUpdates = Promise.resolve();
  root.effect(() =>
    rpc.on(protocol, "configureEditor", (settings) => {
      editorUpdates = editorUpdates
        .then(() => editor.update({ ...editor.config, editor: settings }))
        .catch((error) => root.logger.error("Editor settings failed", error));
    }),
  );
  const configure = pluginReporting(root, rpc);
  await configure(init.features, init.preset === "obsidian");
  await root.settled();
  const failed = [...root.runtime.fibers].find(
    (fiber) => fiber.state === "failed",
  );
  if (failed) {
    throw failed.error;
  }
  rpc.notify(protocol, "initialized", {});
  return root;
}
