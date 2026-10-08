import type { Context, Fiber } from "../kernel";
import type { PanelShell, Workbench } from "../shared/runtime";
import { linksHost } from "../plugins/host";

/** Panel-owned feature hosts follow the same resource-scoped switch as the webview. */
export function hostFeatures(root: Context, panel: PanelShell, workbench: Workbench): void {
  let links: Fiber<{ panel: PanelShell }> | undefined;
  let live = true;
  let queue = Promise.resolve();
  root.effect(() => () => { live = false; });
  const refresh = () => {
    queue = queue.then(async () => {
      if (!live) return;
      const config = workbench.config(panel.document);
      const enabled = config.preset === "obsidian" && (config.features?.links?.enabled ?? true);
      if (!enabled && links) { await links.dispose(); links = undefined; }
      if (enabled && !links) links = root.plugin(linksHost, { panel });
    }).catch((error) => root.logger.error("Host feature configuration failed", error));
  };
  if (workbench.onConfiguration) root.effect(() => workbench.onConfiguration!(refresh));
  refresh();
}
