import type { BaseContext, Infer, Plugin } from "@workshop/core";
import type { featureSettings } from "../shared/features";
import { PluginSwitch, type WantedPlugin } from "../shared/plugin-switch";
import { features } from "../plugins/catalog";
import * as plugins from "../plugins/webview";

type FeatureSettings = Infer<typeof featureSettings>;

/** The webview half of each feature, by feature id. */
const WEBVIEW_FEATURES = features.flatMap((manifest) => {
  // Host-only catalog entries have no webview half.
  const plugin = plugins[`${manifest.id}Webview` as keyof typeof plugins] as
    Plugin<unknown> | undefined;
  return manifest.surfaces.includes("webview") && plugin
    ? [{ manifest, plugin }]
    : [];
});

/**
 * The webview's feature switch: runs the features `settings` turns on (or,
 * with `defaults`, those on by default), each with its parsed configuration.
 */
export function featureController(root: BaseContext) {
  const switches = new PluginSwitch(root);
  const names = WEBVIEW_FEATURES.map(({ plugin }) => plugin.name);
  return async (settings: FeatureSettings, defaults = false): Promise<void> => {
    await switches.update(names, () => wanted(settings, defaults));
    await root.settled();
    root.emit("render/changed");
  };
}

function wanted(settings: FeatureSettings, defaults: boolean): WantedPlugin[] {
  return WEBVIEW_FEATURES.flatMap(({ manifest, plugin }) => {
    const setting = settings[manifest.id];
    if (!(setting?.enabled ?? (defaults && manifest.defaultEnabled))) {
      return [];
    }
    const config = manifest.config?.parse(setting?.config ?? {}) ?? {};
    return [{ plugin, config, signature: JSON.stringify(config) }];
  });
}
