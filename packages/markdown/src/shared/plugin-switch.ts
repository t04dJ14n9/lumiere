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
 * Within one reconcile, configuration updates run in parallel, then stops in
 * parallel, then starts synchronously — plugins do not depend on each other's
 * apply order beyond the kernel's own service graph.
 *
 * Used by every feature switch: window plugins, panel host plugins and
 * webview plugins.
 */
export class PluginSwitch {
  private readonly running = new Map<
    string,
    { handle: PluginHandle<unknown>; signature: string }
  >();
  private queue: Promise<unknown> = Promise.resolve();
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
  ): Promise<ReadonlySet<string>> {
    const next = this.queue
      .catch(() => {})
      .then(() =>
        this.live ? this.reconcile(managed, wanted()) : new Set<string>(),
      );
    this.queue = next;
    this.root.track(next);
    return next;
  }

  private async reconcile(
    managed: readonly string[],
    wanted: readonly WantedPlugin[],
  ): Promise<ReadonlySet<string>> {
    const byName = new Map(wanted.map((entry) => [entry.plugin.name, entry]));
    const stops: Promise<void>[] = [];
    const starts: WantedPlugin[] = [];
    const updates: Promise<void>[] = [];
    const affected = new Set<string>();

    for (const name of managed) {
      const next = byName.get(name);
      const current = this.running.get(name);
      if (!next) {
        if (current) {
          this.running.delete(name);
          stops.push(current.handle.dispose());
          affected.add(name);
        }
        continue;
      }
      const signature = next.signature ?? "";
      if (!current) {
        starts.push(next);
        affected.add(name);
      } else if (current.signature !== signature) {
        current.signature = signature;
        updates.push(current.handle.update(next.config));
        affected.add(name);
      }
    }

    if (updates.length) {
      await Promise.all(updates);
    }
    if (stops.length) {
      await Promise.all(stops);
    }
    // Start service providers before optional consumers so plugins like tables
    // and math bind optional services (formatting, links, vim) on first plug
    // without tearing down and restarting their fiber mid-phase.
    const optionalWanted = new Set<string>();
    for (const entry of starts) {
      for (const opt of entry.plugin.inject?.optional ?? []) {
        optionalWanted.add(opt);
      }
    }
    const providers: WantedPlugin[] = [];
    const consumers: WantedPlugin[] = [];
    for (const entry of starts) {
      if (entry.plugin.provides?.some((p) => optionalWanted.has(p))) {
        providers.push(entry);
      } else {
        consumers.push(entry);
      }
    }
    const providerHandles = providers.map((entry) => {
      const handle = this.root.plugin(entry.plugin, entry.config);
      this.running.set(entry.plugin.name, {
        handle,
        signature: entry.signature ?? "",
      });
      return handle as PluginHandle<unknown> & { idle?(): Promise<unknown> };
    });
    if (providerHandles.length > 0 && consumers.length > 0) {
      await Promise.all(providerHandles.map((h) => h.idle?.()));
      if (!this.live) {
        return affected;
      }
    }
    for (const entry of consumers) {
      const handle = this.root.plugin(entry.plugin, entry.config);
      this.running.set(entry.plugin.name, {
        handle,
        signature: entry.signature ?? "",
      });
    }
    return affected;
  }
}
