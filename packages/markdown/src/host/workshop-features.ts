import type { BaseContext, Plugin } from "@workshop/core";
import type { Manifest } from "../shared/manifest";
import type { HostSettings } from "../shared/host";
import { PluginSwitch } from "../shared/plugin-switch";

/**
 * Window-level plugins (views, status bar, quick switcher, link updates)
 * follow their `lumiere.markdown.plugins.<id>.enabled` setting and the
 * preset, like editor plugins follow theirs per panel.
 */
export function workbenchFeatures(
  root: BaseContext,
  settings: HostSettings,
  entries: readonly { manifest: Manifest; plugin: Plugin; config?: unknown }[],
): void {
  const plugins = new PluginSwitch(root);
  const names = entries.map(({ plugin }) => plugin.name);
  const refresh = () => {
    void plugins.update(names, () => {
      if (settings.get<string>("preset", "obsidian") === "minimal") {
        return [];
      }
      return entries.filter(({ manifest }) =>
        settings.get(`plugins.${manifest.id}.enabled`, manifest.defaultEnabled),
      );
    });
  };
  root.effect(() => settings.onChange(refresh));
  root.on("editor/configure", refresh);
  refresh();
}
