import { webviewLogging } from "../plugins/editor/logging";
import { pluginRank } from "../plugins/catalog";
import { pluginReporting } from "./plugin-reporting";
import { preloadChromeFeatures, preloadPaintFeatures } from "./features";
import { preloadYaml } from "../markdown/properties/load-yaml";
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
  // Chrome (Properties) must not wait on tables/callouts download. Start both
  // preloads as soon as we know the Obsidian preset, overlapping core settle.
  // YAML must be warm before settled(): Live Preview metadata() parses
  // frontmatter synchronously on first EditorView decorations.
  const yamlReady =
    init.preset === "obsidian" ? preloadYaml() : Promise.resolve();
  const chromeChunks =
    init.preset === "obsidian" ? preloadChromeFeatures() : Promise.resolve();
  const paintChunks =
    init.preset === "obsidian" ? preloadPaintFeatures() : Promise.resolve();
  await yamlReady;
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
 * Properties chrome starts as soon as its chunks (and YAML) are ready — do
 * not wait for the first-paint rAF. Glyphs still mark on rAF from core Live
 * Preview. No HTML boot skeleton and no modulepreload chrome entry (#286
 * regressed interactive ~0.3 s on that path).
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
  });
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
}
