import type { BaseContext, Infer, Plugin } from "@workshop/core";
import type { featureSettings } from "../shared/features";
import { PluginSwitch, type WantedPlugin } from "../shared/plugin-switch";
import { features } from "../plugins/catalog";

type FeatureSettings = Infer<typeof featureSettings>;

/**
 * Dynamic loaders for every catalog feature that has a webview half. Keeps the
 * editor entry free of Vim, MathJax wiring, Mermaid registration, online-video
 * parsers and other feature modules until they are enabled.
 */
const WEBVIEW_LOADERS: Record<string, () => Promise<Plugin<unknown>>> = {
  autoPair: () =>
    import("../plugins/autoPair/webview").then((m) => m.autoPairWebview),
  callouts: () =>
    import("../plugins/callouts/webview").then((m) => m.calloutsWebview),
  codeBlocks: () =>
    import("../plugins/codeBlocks/webview").then((m) => m.codeBlocksWebview),
  agentBridge: () =>
    import("../plugins/agentBridge/webview").then((m) => m.agentBridgeWebview),
  cursorBridge: () =>
    import("../plugins/cursorBridge/webview").then(
      (m) => m.cursorBridgeWebview,
    ),
  diagrams: () =>
    import("../plugins/diagrams/webview").then((m) => m.diagramsWebview),
  embeds: () =>
    import("../plugins/embeds/webview").then((m) => m.embedsWebview),
  folding: () =>
    import("../plugins/folding/webview").then((m) => m.foldingWebview),
  footnotes: () =>
    import("../plugins/footnotes/webview").then((m) => m.footnotesWebview),
  formatting: () =>
    import("../plugins/formatting/webview").then((m) => m.formattingWebview),
  gitGutter: () =>
    import("../plugins/gitGutter/webview").then((m) => m.gitGutterWebview),
  gitInline: () =>
    import("../plugins/gitInline/webview").then((m) => m.gitInlineWebview),
  gitBlame: () =>
    import("../plugins/gitBlame/webview").then((m) => m.gitBlameWebview),
  indentGuides: () =>
    import("../plugins/indentGuides/webview").then(
      (m) => m.indentGuidesWebview,
    ),
  stickyScroll: () =>
    import("../plugins/stickyScroll/webview").then(
      (m) => m.stickyScrollWebview,
    ),
  inlineTitle: () =>
    import("../plugins/inlineTitle/webview").then((m) => m.inlineTitleWebview),
  lineNumbers: () =>
    import("../plugins/lineNumbers/webview").then((m) => m.lineNumbersWebview),
  links: () => import("../plugins/links/webview").then((m) => m.linksWebview),
  math: () => import("../plugins/math/webview").then((m) => m.mathWebview),
  onlineVideos: () =>
    import("../plugins/onlineVideos/webview").then(
      (m) => m.onlineVideosWebview,
    ),
  pagePreview: () =>
    import("../plugins/pagePreview/webview").then((m) => m.pagePreviewWebview),
  pasteHtml: () =>
    import("../plugins/pasteHtml/webview").then((m) => m.pasteHtmlWebview),
  properties: () =>
    import("../plugins/properties/webview").then((m) => m.propertiesWebview),
  sourcesProperty: () =>
    import("../plugins/sourcesProperty/webview").then(
      (m) => m.sourcesPropertyWebview,
    ),
  search: () =>
    import("../plugins/search/webview").then((m) => m.searchWebview),
  smartLists: () =>
    import("../plugins/smartLists/webview").then((m) => m.smartListsWebview),
  spellcheck: () =>
    import("../plugins/spellcheck/webview").then((m) => m.spellcheckWebview),
  suggest: () =>
    import("../plugins/suggest/webview").then((m) => m.suggestWebview),
  tables: () =>
    import("../plugins/tables/webview").then((m) => m.tablesWebview),
  tags: () => import("../plugins/tags/webview").then((m) => m.tagsWebview),
  tasks: () => import("../plugins/tasks/webview").then((m) => m.tasksWebview),
  vim: () => import("../plugins/vim/webview").then((m) => m.vimWebview),
};

const loaded = new Map<string, Plugin<unknown>>();

async function loadWebviewPlugin(
  id: string,
): Promise<Plugin<unknown> | undefined> {
  const cached = loaded.get(id);
  if (cached) {
    return cached;
  }
  const loader = WEBVIEW_LOADERS[id];
  if (!loader) {
    return undefined;
  }
  const plugin = await loader();
  loaded.set(id, plugin);
  return plugin;
}

const WEBVIEW_FEATURE_IDS = features
  .filter((manifest) => manifest.surfaces.includes("webview"))
  .map((manifest) => manifest.id);

/**
 * The webview's feature switch: runs the features `settings` turns on (or,
 * with `defaults`, those on by default), each with its parsed configuration.
 * Feature modules load in parallel the first time they are wanted.
 */
export function featureController(root: BaseContext) {
  const switches = new PluginSwitch(root);
  // Serialize load + switch so overlapping configure calls cannot apply an
  // older wanted set after a newer one finished loading. Do not root.track
  // this queue: it awaits settled(), which would deadlock on itself.
  let updates = Promise.resolve();
  return (settings: FeatureSettings, defaults = false): Promise<void> => {
    const run = async () => {
      const wantedManifests = features.filter((manifest) => {
        if (!manifest.surfaces.includes("webview")) {
          return false;
        }
        const setting = settings[manifest.id];
        return setting?.enabled ?? (defaults && manifest.defaultEnabled);
      });
      await Promise.all(
        wantedManifests.map((manifest) => loadWebviewPlugin(manifest.id)),
      );
      await switches.update(WEBVIEW_FEATURE_IDS, () =>
        wantedPlugins(wantedManifests, settings),
      );
    };
    const next = updates.catch(() => {}).then(run);
    updates = next;
    return next.then(async () => {
      await root.settled();
      root.emit("render/changed");
    });
  };
}

function wantedPlugins(
  manifests: typeof features,
  settings: FeatureSettings,
): WantedPlugin[] {
  return manifests.flatMap((manifest) => {
    const plugin = loaded.get(manifest.id);
    if (!plugin) {
      return [];
    }
    const setting = settings[manifest.id];
    const config = manifest.config?.parse(setting?.config ?? {}) ?? {};
    return [{ plugin, config, signature: JSON.stringify(config) }];
  });
}
