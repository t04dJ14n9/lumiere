import type { Context, Fiber } from "../kernel";
import { features } from "../plugins/catalog";
import type { PanelShell, Workbench } from "../shared/runtime";
import {
  linksHost,
  tasksHost,
  propertiesHost,
  tagsHost,
  suggestHost,
  searchHost,
  onlineVideosHost,
} from "../plugins/host";

/** Panel-owned feature hosts follow the same resource-scoped switch as the webview. */
export function hostFeatures(
  root: Context,
  panel: PanelShell,
  workbench: Workbench,
): void {
  const active = new Map<string, Fiber<{ panel: PanelShell }>>();
  let live = true;
  let queue = Promise.resolve();
  root.effect(() => () => {
    live = false;
  });
  const refresh = () => {
    queue = queue
      .then(async () => {
        if (!live) {
          return;
        }
        const config = workbench.config(panel.document);
        for (const plugin of [
          linksHost,
          tasksHost,
          propertiesHost,
          tagsHost,
          suggestHost,
          searchHost,
          onlineVideosHost,
        ]) {
          const enabled =
            config.preset === "obsidian" &&
            (config.features?.[plugin.name]?.enabled ??
              features.some(
                (manifest) =>
                  manifest.id === plugin.name && manifest.defaultEnabled,
              ));
          const previous = active.get(plugin.name);
          if (!enabled && previous) {
            await previous.dispose();
            active.delete(plugin.name);
          }
          if (enabled && !active.has(plugin.name)) {
            active.set(plugin.name, root.plugin(plugin, { panel }));
          }
        }
      })
      .catch((error) =>
        root.logger.error("Host feature configuration failed", error),
      );
    root.runtime.track(queue);
  };
  if (workbench.onConfiguration) {
    root.effect(() => workbench.onConfiguration!(refresh));
  }
  root.on("editor/configure", refresh);
  refresh();
}
