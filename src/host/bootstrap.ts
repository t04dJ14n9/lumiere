import { pluginRank, workbenchFeatures } from "../plugins/catalog";
import { hostFeatures } from "./features";
import { features } from "../plugins/catalog";
import { Context } from "../kernel";
import type { Workbench } from "../shared/runtime";
import type { VaultSystem } from "../plugins/vault/api";
import {
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
} from "../plugins/host";
import { workbenchFeatures as startWorkbenchFeatures } from "./workbench-features";
export async function bootstrap(
  workbench: Workbench,
  vaultSystem?: VaultSystem,
) {
  const root = Context.create({ rank: pluginRank });
  root.provide("workbench", workbench);
  if (vaultSystem) {
    root.provide("vaultSystem", vaultSystem);
  }
  root.plugin(documentHost);
  root.plugin(vaultsHost);
  root.plugin(editorHost, {
    features,
    configure(context, panel) {
      if (workbench.config(panel.document).preset === "obsidian") {
        context.plugin(vaultHost, { documentUri: panel.document.uri });
        context.plugin(resourcesHost, { panel });
        hostFeatures(context, panel, workbench);
      }
    },
  });
  root.plugin(dialectHost);
  root.plugin(commandsHost, { features });
  root.plugin(livePreviewHost);
  const windowPlugins = [
    backlinksHost,
    outgoingLinksHost,
    outlineHost,
    quickSwitcherHost,
    wordCountHost,
    linkUpdatesHost,
  ];
  startWorkbenchFeatures(
    root,
    workbench,
    windowPlugins.map((plugin) => ({
      manifest: workbenchFeatures.find((item) => item.id === plugin.name)!,
      plugin,
    })),
  );
  await root.settled();
  return root;
}
