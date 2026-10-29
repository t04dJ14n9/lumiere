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
  // Overlap Properties/Sources chunk fetch with the host ready round-trip.
  const earlyChrome = preloadChromeFeatures();
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
  // Sheet (Properties/Sources) must not share the settle-window wire with
  // tables/callouts. Start chrome preload as soon as we know the Obsidian
  // preset; paint structure starts only at first-paint rAF (wave 13 — not
  // the closed #288 wait-for-chrome-resolve serialize).
  const chromeChunks =
    init.preset === "obsidian" ? earlyChrome : Promise.resolve();
  const startPaint =
    init.preset === "obsidian"
      ? () => preloadPaintFeatures(init.features, true)
      : (): Promise<void> => Promise.resolve();
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
    startPaint,
    features: init.features,
    defaults: init.preset === "obsidian",
  });
  rpc.notify(protocol, "initialized", {});
  return root;
}

/**
 * Glyphs first (rAF), then Properties as soon as sheet chunks are ready —
 * without waiting on tables/tags. Paint structure fetch starts on this same
 * frame (after chrome had the settle window alone) and configures next.
 */
function scheduleFeaturePhases(options: {
  root: RootContext;
  configure: Configure;
  chromeChunks: Promise<void>;
  startPaint: () => Promise<void>;
  features: FeatureSettings;
  defaults: boolean;
}): void {
  const { root, configure, chromeChunks, startPaint, features, defaults } =
    options;
  requestAnimationFrame(() => {
    performance.mark("mw:first-paint");
    // Kick paint download now — chrome already had exclusive settle time.
    // Do not wait for chromeChunks.resolve (#288); overlap paint fetch with
    // sheet configure CPU once the sheet graph is warm.
    const paintChunks = startPaint();
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
