import type { BaseContext, Plugin } from "@workshop/core";
import { features, workbenchFeatures } from "../plugins/catalog";
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
  obsidianCompatPanelHost,
  obsidianMarketplacePanelHost,
} from "../plugins/host";

type PanelHost = Plugin<{ panel: PanelShell }>;

/** Host halves needed before the webview ready handshake returns text. */
const CRITICAL_PANEL_HOSTS: readonly PanelHost[] = [
  linksHost,
  tasksHost,
  propertiesHost,
  sourcesPropertyHost,
  tagsHost,
  cursorBridgePanelHost,
  obsidianCompatPanelHost,
  obsidianMarketplacePanelHost,
];

/**
 * Host halves that only answer later RPC (blame, search, suggest, video
 * cards, …). Started after the ready response so they do not block first
 * paint on large notes or slow SSH FS.
 */
const DEFERRED_PANEL_HOSTS: readonly PanelHost[] = [
  gitGutterHost,
  gitBlameHost,
  suggestHost,
  searchHost,
  onlineVideosHost,
];

/** Panel-owned feature hosts follow the same resource-scoped switch as the webview. */
export function hostFeatures(
  root: BaseContext,
  panel: PanelShell,
  host: Pick<HostServices, "settings">,
): void {
  const critical = new PluginSwitch(root);
  bindPanelSwitch({
    root,
    panel,
    host,
    plugins: critical,
    hosts: CRITICAL_PANEL_HOSTS,
  });

  let deferred: PluginSwitch | undefined;
  const startDeferred = () => {
    if (deferred) {
      return;
    }
    deferred = new PluginSwitch(root);
    bindPanelSwitch({
      root,
      panel,
      host,
      plugins: deferred,
      hosts: DEFERRED_PANEL_HOSTS,
    });
  };
  // Emitted by the panel ready handler after it has answered the webview.
  root.on("editor/session-ready", startDeferred);
}

function bindPanelSwitch(options: {
  root: BaseContext;
  panel: PanelShell;
  host: Pick<HostServices, "settings">;
  plugins: PluginSwitch;
  hosts: readonly PanelHost[];
}): void {
  const { root, panel, host, plugins, hosts } = options;
  const names = hosts.map((plugin) => plugin.name);
  const refresh = () => {
    void plugins.update(names, () => {
      const settings = host.settings.forNote(panel.document);
      return hosts
        .filter((plugin) => isEnabled(settings, plugin.name))
        .map((plugin) => ({ plugin, config: { panel } }));
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
    [...features, ...workbenchFeatures].some(
      (manifest) => manifest.id === id && manifest.defaultEnabled,
    )
  );
}
