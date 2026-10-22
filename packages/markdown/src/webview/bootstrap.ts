import { webviewLogging } from "../plugins/editor/logging";
import { pluginRank } from "../plugins/catalog";
import { pluginReporting } from "./plugin-reporting";
import { registerEditorSettings } from "./editor-settings";
import { createRoot } from "@workshop/core";
import type { Infer } from "@workshop/core";
import type { viewState } from "../plugins/editor/protocol";
import type { Endpoint } from "../shared/rpc/endpoint";
import { protocol } from "../plugins/editor/protocol";
import { documentWebview } from "../plugins/document/webview";
import { markersWebview } from "../plugins/markers/webview";
import { editorWebview } from "../plugins/editor/webview";
import { dialectWebview } from "../plugins/dialect/webview";
import { commandsWebview } from "../plugins/commands/webview";
import { livePreviewWebview } from "../plugins/livePreview/webview";
import { renderWebview } from "../plugins/render/webview";
import { resourcesWebview } from "../plugins/resources/webview";
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
  performance.mark("mw:ready");
  logging.configure(init.debugLogging);
  const root = createRoot({
    logger: logging.logger,
    rank: pluginRank,
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
  registerEditorSettings(root, rpc, editor);
  const configure = pluginReporting(root, rpc);
  await configure(init.features, init.preset === "obsidian");
  performance.mark("mw:features");
  await root.settled();
  const failed = [...root.plugins].find((fiber) => fiber.state === "failed");
  if (failed) {
    throw failed.error;
  }
  performance.mark("mw:plugins");
  requestAnimationFrame(() => performance.mark("mw:first-paint"));
  rpc.notify(protocol, "initialized", {});
  return root;
}
