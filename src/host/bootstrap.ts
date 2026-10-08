import { features } from "../plugins/catalog";
import { Context } from "../kernel";
import type { Workbench } from "../shared/runtime";
import {
  documentHost,
  editorHost,
  dialectHost,
  commandsHost,
  livePreviewHost,
  vaultHost,
  resourcesHost,
} from "../plugins/host";
export async function bootstrap(workbench: Workbench) {
  const root = Context.create();
  root.provide("workbench", workbench);
  root.plugin(documentHost);
  root.plugin(editorHost, {
    features,
    configure(context, panel) {
      if (workbench.config(panel.document).preset === "obsidian") {
        context.plugin(vaultHost, { root: workbench.root(panel.document) });
        context.plugin(resourcesHost, { panel });
      }
    },
  });
  root.plugin(dialectHost);
  root.plugin(commandsHost, { features });
  root.plugin(livePreviewHost);
  await root.settled();
  return root;
}
