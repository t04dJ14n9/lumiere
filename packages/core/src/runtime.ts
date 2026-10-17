import { Context as CordisContext } from "cordis";
import type { Disposer } from "./activation";
import { EventBus } from "./event-bus";
import { ResourceLedger } from "./ledger";
import type { Logger } from "./logger";
import type { ServiceName } from "./types";

/** Cordis reports every service that appears, disappears or is replaced. */
function onCordisServiceChange(
  cordis: CordisContext,
  listener: (name: string) => void,
): Disposer {
  const stop = cordis.on("internal/service", listener);
  return () => void stop();
}

/** What `settled()` needs from a started plugin. */
export interface Settling {
  readonly isBusy: boolean;
  idle(): Promise<unknown>;
}

/**
 * The state one plugin tree shares: the Cordis context that runs its
 * plugins, the event bus, the resource ledger and the work `settled()`
 * waits for. Every plugin's Cordis fiber is created directly on `cordis`;
 * ownership (which plugin started which) is tracked by activations instead,
 * so a child is stopped exactly once, by its owner, in last-first order.
 */
export class Runtime {
  readonly cordis = new CordisContext();
  readonly bus: EventBus;
  readonly ledger = new ResourceLedger();
  readonly started = new Set<Settling>();
  /**
   * Each published service and the plugin that provides it. Cordis decides
   * when a service is available (its provider has started); this map hands
   * out the provided object itself, never a Cordis proxy around it.
   */
  readonly published = new Map<
    ServiceName,
    { owner: string; value: unknown }
  >();
  private readonly jobs = new Set<Promise<unknown>>();
  private readonly watchers = new Map<string, Set<(name: string) => void>>();
  /** Errors already reported by the plugin that raised them. */
  readonly reported = new WeakSet<object>();
  private readonly detach: Disposer[] = [];

  constructor(
    readonly logger: Logger,
    readonly rank: (owner: string) => number,
  ) {
    this.bus = new EventBus(rank);
    this.detach.push(
      onCordisServiceChange(this.cordis, (name) => this.notify(name)),
      this.cordis.logger.exporter({
        export: (message) => this.reportCordisError(message),
      }) as Disposer,
    );
  }

  /** A service whose provider has started, or undefined. */
  get(name: ServiceName): unknown {
    return this.cordis.get(name) === undefined
      ? undefined
      : this.published.get(name)?.value;
  }

  has(name: ServiceName): boolean {
    return this.get(name) !== undefined;
  }

  /** Call `listener` whenever one of `names` appears, disappears or is replaced. */
  watch(
    names: readonly ServiceName[],
    listener: (name: string) => void,
  ): () => void {
    for (const name of names) {
      let listeners = this.watchers.get(name);
      if (!listeners) {
        listeners = new Set();
        this.watchers.set(name, listeners);
      }
      listeners.add(listener);
    }
    return () => {
      for (const name of names) {
        this.watchers.get(name)?.delete(listener);
      }
    };
  }

  track(job: Promise<unknown>): void {
    this.jobs.add(job);
    // Not `finally`: its promise would reject with the job, unhandled.
    const forget = () => void this.jobs.delete(job);
    job.then(forget, forget);
  }

  /** Resolves once no plugin is starting or stopping and no tracked job runs. */
  async settled(): Promise<void> {
    for (;;) {
      const busy = [...this.started].filter((plugin) => plugin.isBusy);
      if (!busy.length && !this.jobs.size) {
        return;
      }
      await Promise.allSettled([
        ...this.jobs,
        ...busy.map((plugin) => plugin.idle()),
      ]);
    }
  }

  /** Stop listening to Cordis; the tree's plugins have already stopped. */
  async close(): Promise<void> {
    for (const detach of this.detach.splice(0)) {
      await detach();
    }
    this.watchers.clear();
  }

  private notify(name: string): void {
    for (const listener of [...(this.watchers.get(name) ?? [])]) {
      listener(name);
    }
  }

  /** Cordis logs its own failures; plugin failures are reported by the plugin. */
  private reportCordisError(message: { type: string; args: unknown[] }): void {
    if (message.type !== "error") {
      return;
    }
    const isReported = message.args.some(
      (arg) =>
        typeof arg === "object" && arg !== null && this.reported.has(arg),
    );
    if (!isReported) {
      this.logger.error("Plugin runtime error", message.args[0]);
    }
  }
}
