import { nativeLinksHost } from "../plugins/links/native-host";
import { features, pluginRank, workbenchFeatures } from "../plugins/catalog";
import { hostFeatures } from "./features";
import type { Logger } from "../kernel";
import { Context } from "../kernel";
import type { Workbench } from "../shared/runtime";
import type { VaultSystem } from "../plugins/vault/api";
import {
  inlineTitleHost,
  codeBlocksHost,
  markersHost,
  agentBridgeHost,
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
  tagsViewHost,
  settingsHost,
} from "../plugins/host";
import { workbenchFeatures as startWorkbenchFeatures } from "./workbench-features";
export async function bootstrap(
  workbench: Workbench,
  vaultSystem?: VaultSystem,
  logger?: Logger,
) {
  const root = Context.create({
    rank: pluginRank,
    ...(logger && { logger }),
    replaceable: ["vault", "resources", "markers"],
  });
  root.provide("workbench", workbench);
  if (vaultSystem) {
    root.provide("vaultSystem", vaultSystem);
  }
  root.plugin(documentHost);
  root.plugin(vaultsHost);
  // The editor host injects these services. Publish them first: a service
  // arriving after it started would restart it, unregistering the editor
  // provider and closing any editor VS Code was already opening.
  await root.settled();
  root.plugin(editorHost, {
    features,
    configure(context, panel) {
      context.on("links/open", (request) =>
        root.bail("links/open", { ...request, editorId: panel.id }),
      );
      if (workbench.config(panel.document).preset === "obsidian") {
        context.plugin(vaultHost, { documentUri: panel.document.uri });
        context.plugin(resourcesHost, { panel });
        hostFeatures(context, panel, workbench);
      }
    },
  });
  root.plugin(markersHost);
  root.plugin(codeBlocksHost);
  root.plugin(inlineTitleHost);
  root.plugin(agentBridgeHost);
  root.plugin(dialectHost);
  root.plugin(commandsHost, { features });
  root.plugin(settingsHost);
  root.plugin(livePreviewHost);
  const windowPlugins = [
    nativeLinksHost,
    backlinksHost,
    outgoingLinksHost,
    outlineHost,
    quickSwitcherHost,
    wordCountHost,
    linkUpdatesHost,
    tagsViewHost,
  ];
  // Window halves of editor features (the Tags view) share their manifest.
  const manifests = [...workbenchFeatures, ...features];
  startWorkbenchFeatures(
    root,
    workbench,
    windowPlugins.map((plugin) => ({
      manifest: manifests.find((item) => item.id === plugin.name)!,
      plugin,
    })),
  );
  await root.settled();
  return root;
}
