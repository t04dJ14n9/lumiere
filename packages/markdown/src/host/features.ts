import type { BaseContext, PluginHandle } from "@workshop/core";
import { features } from "../plugins/catalog";
import type { PanelShell, HostServices } from "../shared/host";
import {
  linksHost,
  tasksHost,
  gitGutterHost,
  gitBlameHost,
  propertiesHost,
  tagsHost,
  suggestHost,
  searchHost,
  onlineVideosHost,
  sourcesPropertyHost,
} from "../plugins/host";

/** Panel-owned feature hosts follow the same resource-scoped switch as the webview. */
export function hostFeatures(
  root: BaseContext,
  panel: PanelShell,
  host: HostServices,
): void {
  const active = new Map<string, PluginHandle<{ panel: PanelShell }>>();
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
        const config = host.settings.forNote(panel.document);
        for (const plugin of [
          linksHost,
          tasksHost,
          gitGutterHost,
          gitBlameHost,
          propertiesHost,
          tagsHost,
          suggestHost,
          searchHost,
          onlineVideosHost,
          sourcesPropertyHost,
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
    root.track(queue);
  };
  root.effect(() => host.settings.onChange(refresh));
  root.on("editor/configure", refresh);
  refresh();
}
