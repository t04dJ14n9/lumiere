import type { Context, Fiber, Plugin } from "../kernel";
import type { Manifest } from "../shared/manifest";
import type { Workbench } from "../shared/runtime";

/**
 * Window-level plugins (views, status bar, quick switcher, link updates)
 * follow their `markdownWorkbench.plugins.<id>.enabled` setting and the
 * preset, like editor plugins follow theirs per panel.
 */
export function workbenchFeatures(
  root: Context,
  workbench: Workbench,
  plugins: readonly { manifest: Manifest; plugin: Plugin }[],
): void {
  const views = workbench.views;
  if (!views) {
    return;
  }
  const active = new Map<string, Fiber<unknown>>();
  let queue = Promise.resolve();
  const refresh = () => {
    queue = queue
      .then(async () => {
        const isObsidian =
          views.setting<string>("preset", "obsidian") !== "minimal";
        for (const { manifest, plugin } of plugins) {
          const enabled =
            isObsidian &&
            views.setting(
              `plugins.${manifest.id}.enabled`,
              manifest.defaultEnabled,
            );
          await toggle(root, active, plugin, enabled);
        }
      })
      .catch((error) =>
        root.logger.error("Workbench feature update failed", error),
      );
    root.runtime.track(queue);
  };
  if (workbench.onConfiguration) {
    root.effect(() => workbench.onConfiguration!(refresh));
  }
  root.on("editor/configure", refresh);
  refresh();
}

async function toggle(
  root: Context,
  active: Map<string, Fiber<unknown>>,
  plugin: Plugin,
  enabled: boolean,
): Promise<void> {
  const previous = active.get(plugin.name);
  if (!enabled && previous) {
    active.delete(plugin.name);
    await previous.dispose();
  }
  if (enabled && !previous) {
    active.set(plugin.name, root.plugin(plugin) as Fiber<unknown>);
  }
}
