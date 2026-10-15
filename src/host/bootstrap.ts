import { diffResourcesHost } from "../plugins/resources/diff-resources";
import { nativeLinksHost } from "../plugins/links/native-host";
import { features, pluginRank, workbenchFeatures } from "../plugins/catalog";
import { hostFeatures } from "./features";
import type { Logger, Plugin } from "../kernel";
import { Context } from "../kernel";
import type { Workshop } from "../shared/runtime";
import type { VaultSystem } from "../plugins/vault/api";
import {
  inlineTitleHost,
  codeBlocksHost,
  markersHost,
  agentBridgeHost,
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
  graphHost,
} from "../plugins/host";
import { workbenchFeatures as startWorkbenchFeatures } from "./workshop-features";
import { createOkfFacade } from "../plugins/okfCore/facade";
import { createCursorHandoffSurface } from "./cursor-handoff";
import * as vscode from "vscode";
export async function bootstrap(
  workshop: Workshop,
  vaultSystem?: VaultSystem,
  logger?: Logger,
) {
  const root = Context.create({
    rank: pluginRank,
    ...(logger && { logger }),
    replaceable: ["vault", "resources", "markers"],
  });
  root.provide("workshop", workshop);
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
      // Panel kernels are isolated. The facade stays put while okfCore binds it.
      context.provide("okf", okf);
      context.on("links/open", (request) =>
        root.bail("links/open", { ...request, editorId: panel.id }),
      );
      if (workshop.config(panel.document).preset === "obsidian") {
        context.plugin(vaultHost, { documentUri: panel.document.uri });
        context.plugin(resourcesHost, { panel });
        hostFeatures(context, panel, workshop);
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
  startWindowFeatures(root, workshop, okf);
  await root.settled();
  return root;
}

/** Window plugins, including the Tags view, which shares an editor-feature manifest. */
function startWindowFeatures(
  root: Context,
  workshop: Workshop,
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
    wikiHost,
    assetsHost,
    scratchHost,
    gitDiffEditorHost,
    marpHost,
    tagsViewHost,
    okfCoreHost,
    obsidianCompatHost,
    graphHost,
  ];
  const manifests = [...workbenchFeatures, ...features];
  startWorkbenchFeatures(
    root,
    workshop,
    plugins.map((plugin) => ({
      manifest: manifests.find((item) => item.id === plugin.name)!,
      plugin: plugin as Plugin,
      ...(plugin.name === "okfCore" ? { config: { facade: okf } } : {}),
    })),
  );
}
