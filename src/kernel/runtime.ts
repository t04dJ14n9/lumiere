import { EventBus } from "./events";
import type { Fiber } from "./fiber";
import type { Logger } from "./logger";
import type { Services } from "./types";

export type Provider = { ctx: unknown; value: unknown };

/**
 * Live resources by owner (a plugin name, or "root") and kind ("effect",
 * "listener", "fiber", "service"). Every acquisition adds one and every
 * release removes one, so a plugin that stopped cleanly owns nothing: the
 * leave-no-trace tests compare snapshots of this ledger.
 */
export class ResourceLedger {
  private readonly counts = new Map<string, number>();
  add(owner: string, kind: string): void {
    const key = `${owner}\u0000${kind}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  remove(owner: string, kind: string): void {
    const key = `${owner}\u0000${kind}`;
    const count = (this.counts.get(key) ?? 0) - 1;
    if (count < 0) {
      throw new Error(`Released an untracked ${kind} of ${owner}`);
    }
    this.counts[count ? "set" : "delete"](key, count);
  }
  /** Owners with at least one live resource, and their counts by kind. */
  snapshot(): Record<string, Record<string, number>> {
    const owners: Record<string, Record<string, number>> = {};
    for (const [key, count] of this.counts) {
      const [owner, kind] = key.split("\u0000") as [string, string];
      (owners[owner] ??= {})[kind] = count;
    }
    return owners;
  }
}

export class Runtime {
  readonly events: EventBus;
  readonly fibers = new Set<Fiber<unknown>>();
  readonly providers = new Map<keyof Services, Provider[]>();
  readonly jobs = new Set<Promise<unknown>>();
  readonly ledger = new ResourceLedger();
  constructor(
    readonly logger: Logger,
    readonly replaceable: ReadonlySet<keyof Services>,
    readonly rank: (owner: string) => number = () => 0,
  ) {
    this.events = new EventBus(rank);
  }
  value(name: keyof Services): unknown {
    return this.providers.get(name)?.at(-1)?.value;
  }
  /**
   * Re-gate every fiber after a service change. Resolves once the consumers
   * this change stopped have finished stopping, so a provider can withdraw
   * its services and wait for its consumers before releasing what backs them.
   */
  changed(): Promise<void> {
    const stops = [...this.fibers].map((fiber) => fiber.reconcile());
    return Promise.all(stops).then(() => undefined);
  }
  track(job: Promise<unknown>): void {
    this.jobs.add(job);
    void job.finally(() => this.jobs.delete(job));
  }
  async settled(): Promise<void> {
    while (this.jobs.size) {
      await Promise.all([...this.jobs]);
    }
  }
}
