import type { BaseContext, Plugin } from "@workshop/core";
import type { Manifest } from "../shared/manifest";
import type { HostSettings } from "../shared/host";
import { PluginSwitch } from "../shared/plugin-switch";

export interface WorkbenchEntry {
  manifest: Manifest;
  plugin: Plugin;
  config?: unknown;
}

/**
 * Window-level plugins (views, status bar, quick switcher, link updates)
 * follow their `lumiere.markdown.plugins.<id>.enabled` setting and the
 * preset, like editor plugins follow theirs per panel.
 *
 * `defer` entries start on the first `editor/ready`, so activation and the
 * first note's ready handshake are not blocked by graph/marp/backlinks and
 * similar work.
 */
export function workbenchFeatures(
  root: BaseContext,
  settings: HostSettings,
  entries: readonly WorkbenchEntry[],
  options: { defer?: readonly string[] } = {},
): void {
  const deferredNames = new Set(options.defer ?? []);
  const urgent = entries.filter(
    (entry) => !deferredNames.has(entry.plugin.name),
  );
  const deferred = entries.filter((entry) =>
    deferredNames.has(entry.plugin.name),
  );

  bindSwitch(root, settings, urgent);

  if (deferred.length === 0) {
    return;
  }

  let started = false;
  const startDeferred = () => {
    if (started) {
      return;
    }
    started = true;
    bindSwitch(root, settings, deferred);
  };

  root.on("editor/ready", startDeferred);
}

function bindSwitch(
  root: BaseContext,
  settings: HostSettings,
  entries: readonly WorkbenchEntry[],
): void {
  if (entries.length === 0) {
    return;
  }
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
