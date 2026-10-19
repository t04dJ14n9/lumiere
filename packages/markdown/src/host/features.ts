import type { BaseContext } from "@workshop/core";
import { features } from "../plugins/catalog";
import type { NoteSettings, PanelShell, HostServices } from "../shared/host";
import { PluginSwitch } from "../shared/plugin-switch";
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
  cursorBridgePanelHost,
} from "../plugins/host";

/** The host halves of editor features: one set per panel. */
const PANEL_HOSTS = [
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
  cursorBridgePanelHost,
];

/** Panel-owned feature hosts follow the same resource-scoped switch as the webview. */
export function hostFeatures(
  root: BaseContext,
  panel: PanelShell,
  host: Pick<HostServices, "settings">,
): void {
  const plugins = new PluginSwitch(root);
  const names = PANEL_HOSTS.map((plugin) => plugin.name);
  const refresh = () => {
    void plugins.update(names, () => {
      const settings = host.settings.forNote(panel.document);
      return PANEL_HOSTS.filter((plugin) =>
        isEnabled(settings, plugin.name),
      ).map((plugin) => ({ plugin, config: { panel } }));
    });
  };
  root.effect(() => host.settings.onChange(refresh));
  root.on("editor/configure", refresh);
  refresh();
}

/** On in the Obsidian preset when its setting (or else its default) says so. */
function isEnabled(settings: NoteSettings, id: string): boolean {
  if (settings.preset !== "obsidian") {
    return false;
  }
  return (
    settings.features?.[id]?.enabled ??
    features.some((manifest) => manifest.id === id && manifest.defaultEnabled)
  );
}
