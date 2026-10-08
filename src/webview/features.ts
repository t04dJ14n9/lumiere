import type { Context, Fiber, Infer, Plugin } from "../kernel";
import type { featureSettings } from "../shared/features";
import { features } from "../plugins/catalog";
import * as plugins from "../plugins/webview";

/** Serialize reconciliation so a slow stop cannot race a newer setting. */
export function featureController(root: Context) {
  const active = new Map<
    string,
    { fiber: Fiber<unknown>; signature: string }
  >();
  let queue = Promise.resolve();
  let disposed = false;
  root.effect(() => () => {
    disposed = true;
  });
  return (
    settings: Infer<typeof featureSettings>,
    defaults = false,
  ): Promise<void> => {
    queue = queue
      .catch(() => {})
      .then(async () => {
        if (disposed) return;
        for (const manifest of features) {
          const setting = settings[manifest.id];
          const enabled =
            setting?.enabled ?? (defaults && manifest.defaultEnabled);
          const config = manifest.config?.parse(setting?.config ?? {}) ?? {};
          const signature = JSON.stringify(config);
          const previous = active.get(manifest.id);
          if (previous && (!enabled || previous.signature !== signature)) {
            await previous.fiber.dispose();
            active.delete(manifest.id);
          }
          if (enabled && !active.has(manifest.id)) {
            const plugin = plugins[
              `${manifest.id}Webview` as keyof typeof plugins
            ] as Plugin<unknown>;
            active.set(manifest.id, {
              fiber: root.plugin(plugin, config),
              signature,
            });
          }
        }
        await root.settled();
      });
    return queue;
  };
}
