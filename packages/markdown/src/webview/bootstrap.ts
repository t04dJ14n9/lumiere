import { webviewLogging } from "../plugins/editor/logging";
import { pluginRank } from "../plugins/catalog";
import { pluginReporting } from "./plugin-reporting";
import { preloadChromeFeatures, preloadPaintFeatures } from "./features";
import { registerEditorSettings } from "./editor-settings";
import { createRoot, type RootContext } from "@workshop/core";
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
import type { featureSettings } from "../shared/features";

type FeatureSettings = Infer<typeof featureSettings>;
type Configure = ReturnType<typeof pluginReporting>;

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
  // Chrome (Properties) must not wait on tables/callouts *configure* (#285) and
  // must not *compete* with those chunks on the wire during settle. #286/#287
  // tried earlier chrome / dynamic YAML and lost interactive; keep first-paint
  // rAF + sync yaml. Start chrome preload immediately; start paint preload
  // only once chrome chunks resolve so Properties owns bandwidth first.
  const chromeChunks =
    init.preset === "obsidian" ? preloadChromeFeatures() : Promise.resolve();
  const paintChunks =
    init.preset === "obsidian"
      ? chromeChunks.then(() => preloadPaintFeatures())
      : Promise.resolve();
  await root.settled();
  const failed = [...root.plugins].find((fiber) => fiber.state === "failed");
  if (failed) {
    throw failed.error;
  }
  performance.mark("mw:plugins");
  scheduleFeaturePhases({
    root,
    configure,
    chromeChunks,
    paintChunks,
    features: init.features,
    defaults: init.preset === "obsidian",
  });
  rpc.notify(protocol, "initialized", {});
  return root;
}

/**
 * Glyphs first (rAF), then Properties as soon as chrome chunks are ready —
 * without waiting on tables. Paint structure and the deferred set follow.
 */
function scheduleFeaturePhases(options: {
  root: RootContext;
  configure: Configure;
  chromeChunks: Promise<void>;
  paintChunks: Promise<void>;
  features: FeatureSettings;
  defaults: boolean;
}): void {
  const { root, configure, chromeChunks, paintChunks, features, defaults } =
    options;
  requestAnimationFrame(() => {
    performance.mark("mw:first-paint");
    void chromeChunks
      .then(() => configure(features, defaults, "chrome"))
      .then(() => {
        performance.mark("mw:properties");
        return paintChunks.then(() => configure(features, defaults, "paint"));
      })
      .then(() => {
        performance.mark("mw:features");
        return configure(features, defaults, "all");
      })
      .catch((error: unknown) =>
        root.logger.error("Deferred features failed", error),
      );
  });
}
