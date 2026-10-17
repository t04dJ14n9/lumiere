import type { BaseContext, PluginHandle, Infer, Plugin } from "@workshop/core";
import type { featureSettings } from "../shared/features";
import { features } from "../plugins/catalog";
import * as plugins from "../plugins/webview";

type FeatureSettings = Infer<typeof featureSettings>;

/** Serialize reconciliation so a slow stop cannot race a newer setting. */
export function featureController(root: BaseContext) {
  const controller = new FeatureController(root);
  root.effect(() => () => controller.dispose());
  return (settings: FeatureSettings, defaults = false): Promise<void> =>
    controller.update(settings, defaults);
}

class FeatureController {
  private readonly active = new Map<
    string,
    { fiber: PluginHandle<unknown>; signature: string }
  >();
  private queue = Promise.resolve();
  private isDisposed = false;

  constructor(private readonly root: BaseContext) {}

  dispose(): void {
    this.isDisposed = true;
  }

  update(settings: FeatureSettings, defaults: boolean): Promise<void> {
    // A failed configuration must not prevent a later valid update from running.
    this.queue = this.queue
      .catch(() => {})
      .then(() => this.reconcile(settings, defaults));
    return this.queue;
  }

  private async reconcile(
    settings: FeatureSettings,
    defaults: boolean,
  ): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    for (const manifest of features) {
      // Host-only catalog entries (surfaces without webview) have no *Webview
      // plugin; loading them would call root.plugin(undefined) and throw on
      // `.inject` during browser/editor bootstrap.
      if (!manifest.surfaces.includes("webview")) {
        continue;
      }
      const setting = settings[manifest.id];
      const enabled = setting?.enabled ?? (defaults && manifest.defaultEnabled);
      const config = manifest.config?.parse(setting?.config ?? {}) ?? {};
      const pending = this.reconcileFeature(manifest.id, enabled, config);
      if (pending) {
        await pending;
      }
    }
    await this.root.settled();
    this.root.emit("render/changed");
  }

  private reconcileFeature(
    id: string,
    enabled: boolean,
    config: unknown,
  ): Promise<void> | undefined {
    const signature = JSON.stringify(config);
    const previous = this.active.get(id);
    if (previous && !enabled) {
      return previous.fiber.dispose().then(() => {
        this.active.delete(id);
      });
    }
    if (enabled && previous && previous.signature !== signature) {
      return previous.fiber.update(config).then(() => {
        previous.signature = signature;
      });
    }
    if (enabled && !this.active.has(id)) {
      const plugin = plugins[`${id}Webview` as keyof typeof plugins] as
        Plugin<unknown> | undefined;
      if (!plugin) {
        return;
      }
      this.active.set(id, {
        fiber: this.root.plugin(plugin, config),
        signature,
      });
    }
  }
}
