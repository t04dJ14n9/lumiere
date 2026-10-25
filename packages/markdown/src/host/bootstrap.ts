import { nativeLinksHost } from "../plugins/links/native-host";
import { features, pluginRank, workbenchFeatures } from "../plugins/catalog";
import { hostFeatures } from "./features";
import { createRoot } from "@workshop/core";
import { providePluginStates } from "../shared/plugin-state";
import { provideHostServices } from "../shared/host";
import type { BaseContext, Plugin, RootContext } from "@workshop/core";
import type { HostServices } from "../shared/host";
import type { VaultSystem } from "../plugins/vault/api";
import {
  inlineTitleHost,
  codeBlocksHost,
  markersHost,
  agentBridgeHost,
  ideContextHost,
  cursorBridgeHost,
  documentHost,
  editorHost,
  dialectHost,
  commandsHost,
  livePreviewHost,
  vaultHost,
  vaultsHost,
  resourcesHost,
  backlinksHost,
  outgoingLinksHost,
  outlineHost,
  quickSwitcherHost,
  wordCountHost,
  linkUpdatesHost,
  bridgeHost,
  wikiHost,
  assetsHost,
  scratchHost,
  gitDiffEditorHost,
  marpHost,
  tagsViewHost,
  settingsHost,
  okfCoreHost,
  obsidianCompatHost,
  obsidianMarketplaceHost,
  graphHost,
  diffResourcesHost,
} from "../plugins/host";
import { workbenchFeatures as startWorkbenchFeatures } from "./workshop-features";
import { createOkfFacade } from "../plugins/okfCore/facade";
import { createCursorHandoffSurface } from "./cursor-handoff";
import * as vscode from "vscode";
/**
 * Start Lumière's plugins in `root` (the extension's plugin tree;
 * tests get a fresh one).
 */
export async function bootstrap(
  host: HostServices,
  vaultSystem?: VaultSystem,
  root: RootContext = createRoot({ rank: pluginRank }),
): Promise<RootContext> {
  provideHostServices(root, host);
  providePluginStates(root);
  if (vaultSystem) {
    root.provide("vaultSystem", vaultSystem);
  }
  root.plugin(documentHost);
  root.plugin(vaultsHost);
  root.plugin(diffResourcesHost);
  // The editor host injects these services. Publish them first: a service
  // arriving after it started would restart it, unregistering the editor
  // provider and closing any editor VS Code was already opening.
  await root.settled();
  const okf = createOkfFacade();
  root.plugin(editorHost, {
    features,
    configure(context, panel) {
      // Panel trees are isolated: hand them the host services explicitly.
      provideHostServices(context, host);
      // The facade stays put while okfCore binds it.
      context.provide("okf", okf);
      context.on("links/open", (request) =>
        root.bail("links/open", { ...request, editorId: panel.id }),
      );
      if (host.settings.forNote(panel.document).preset === "obsidian") {
        context.plugin(vaultHost, { documentUri: panel.document.uri });
        context.plugin(resourcesHost, { panel });
        hostFeatures(context, panel, host);
      }
    },
  });
  root.plugin(markersHost);
  root.plugin(codeBlocksHost);
  root.plugin(inlineTitleHost);
  root.plugin(agentBridgeHost);
  root.plugin(cursorBridgeHost, {
    appName: vscode.env?.appName ?? "",
    surface: createCursorHandoffSurface(),
  });
  root.plugin(dialectHost);
  root.plugin(commandsHost, { features });
  root.plugin(settingsHost);
  root.plugin(livePreviewHost);
  startWindowFeatures(root, host, okf);
  await root.settled();
  return root;
}

/** Window plugins, including the Tags view, which shares an editor-feature manifest. */
function startWindowFeatures(
  root: BaseContext,
  host: HostServices,
  okf: ReturnType<typeof createOkfFacade>,
): void {
  const plugins = [
    nativeLinksHost,
    backlinksHost,
    outgoingLinksHost,
    outlineHost,
    quickSwitcherHost,
    wordCountHost,
    linkUpdatesHost,
    bridgeHost,
    ideContextHost,
    wikiHost,
    assetsHost,
    scratchHost,
    gitDiffEditorHost,
    marpHost,
    tagsViewHost,
    okfCoreHost,
    obsidianCompatHost,
    obsidianMarketplaceHost,
    graphHost,
  ];
  const manifests = [...workbenchFeatures, ...features];
  startWorkbenchFeatures(
    root,
    host.settings,
    plugins.map((plugin) => ({
      manifest: manifests.find((item) => item.id === plugin.name)!,
      plugin: plugin as Plugin,
      ...(plugin.name === "okfCore" ? { config: { facade: okf } } : {}),
    })),
    {
      // Needed before the first panel's settings.prepare / link open path.
      // Everything else waits for editor/ready so activation settles fast.
      defer: [
        "backlinks",
        "outgoingLinks",
        "outline",
        "quickSwitcher",
        "wordCount",
        "bridge",
        "ideContext",
        "wiki",
        "assets",
        "scratch",
        "gitDiffEditor",
        "marp",
        "tags",
        "okfCore",
        "graph",
        "linkUpdates",
        "obsidianMarketplace",
      ],
    },
  );
}
