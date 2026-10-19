import type { BaseContext, Plugin, PluginHandle } from "@workshop/core";

/** A plugin that should run, with the configuration it should run with. */
export interface WantedPlugin {
  readonly plugin: Plugin<unknown>;
  readonly config?: unknown;
  /**
   * Changes whenever the configuration does; a running plugin is updated
   * when it changes. Omitted: the configuration never changes.
   */
  readonly signature?: string;
}

/**
 * Keeps a set of optional plugins running exactly as wanted: starts the ones
 * turned on, stops the ones turned off, and passes a changed configuration
 * to the ones still on. Updates run one after another, so a slow stop cannot
 * race a newer setting, and a failed update does not block the next one.
 *
 * Used by every feature switch: window plugins, panel host plugins and
 * webview plugins.
 */
export class PluginSwitch {
  private readonly running = new Map<
    string,
    { handle: PluginHandle<unknown>; signature: string }
  >();
  private queue = Promise.resolve();
  private live = true;

  constructor(private readonly root: BaseContext) {
    root.effect(() => () => {
      this.live = false;
    });
  }

  /**
   * Make the plugins named in `managed` match `wanted`: each wanted one runs
   * with its configuration, every other managed one stops.
   */
  update(
    managed: readonly string[],
    wanted: () => readonly WantedPlugin[],
  ): Promise<void> {
    const next = this.queue
      .catch(() => {})
      .then(() => (this.live ? this.reconcile(managed, wanted()) : undefined));
    this.queue = next;
    this.root.track(next);
    return next;
  }

  private async reconcile(
    managed: readonly string[],
    wanted: readonly WantedPlugin[],
  ): Promise<void> {
    const byName = new Map(wanted.map((entry) => [entry.plugin.name, entry]));
    for (const name of managed) {
      await this.apply(name, byName.get(name));
    }
  }

  private async apply(
    name: string,
    wanted: WantedPlugin | undefined,
  ): Promise<void> {
    const current = this.running.get(name);
    if (!wanted) {
      if (current) {
        this.running.delete(name);
        await current.handle.dispose();
      }
      return;
    }
    const signature = wanted.signature ?? "";
    if (!current) {
      const handle = this.root.plugin(wanted.plugin, wanted.config);
      this.running.set(name, { handle, signature });
    } else if (current.signature !== signature) {
      current.signature = signature;
      await current.handle.update(wanted.config);
    }
  }
}
