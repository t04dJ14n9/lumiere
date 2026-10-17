import type { BaseContext, PluginHandle, Plugin } from "@workshop/core";
import type { Manifest } from "../shared/manifest";
import type { Workshop } from "../shared/runtime";

/**
 * Window-level plugins (views, status bar, quick switcher, link updates)
 * follow their `markdownWorkshop.plugins.<id>.enabled` setting and the
 * preset, like editor plugins follow theirs per panel.
 */
export function workbenchFeatures(
  root: BaseContext,
  workshop: Workshop,
  plugins: readonly { manifest: Manifest; plugin: Plugin; config?: unknown }[],
): void {
  const views = workshop.views;
  if (!views) {
    return;
  }
  const active = new Map<string, PluginHandle<unknown>>();
  let queue = Promise.resolve();
  const refresh = () => {
    queue = queue
      .then(async () => {
        const isObsidian =
          views.setting<string>("preset", "obsidian") !== "minimal";
        for (const { manifest, plugin, config } of plugins) {
          const enabled =
            isObsidian &&
            views.setting(
              `plugins.${manifest.id}.enabled`,
              manifest.defaultEnabled,
            );
          await toggle(root, active, { plugin, enabled, config });
        }
      })
      .catch((error) =>
        root.logger.error("Workshop feature update failed", error),
      );
    root.track(queue);
  };
  if (workshop.onConfiguration) {
    root.effect(() => workshop.onConfiguration!(refresh));
  }
  root.on("editor/configure", refresh);
  refresh();
}

async function toggle(
  root: BaseContext,
  active: Map<string, PluginHandle<unknown>>,
  entry: { plugin: Plugin; enabled: boolean; config?: unknown },
): Promise<void> {
  const previous = active.get(entry.plugin.name);
  if (!entry.enabled && previous) {
    active.delete(entry.plugin.name);
    await previous.dispose();
  }
  if (entry.enabled && !previous) {
    active.set(
      entry.plugin.name,
      root.plugin(entry.plugin, entry.config) as PluginHandle<unknown>,
    );
  }
}
