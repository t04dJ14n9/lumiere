import { CoreError } from "./errors";
import type { ResourceLedger } from "./ledger";
import type { Logger } from "./logger";

/** A cleanup function. A returned promise is part of teardown and is awaited. */
export type Disposer = () => void | Promise<void>;

/** Anything that must be undone when its owner stops. */
export interface Resource {
  dispose(): unknown;
}

interface Held {
  release(): Promise<void>;
}

/**
 * Everything one activation of a plugin owns: effects, listeners, services'
 * backing resources and child plugins. Cordis decides when a plugin starts
 * and stops; this class guarantees how its resources are released:
 *
 * - Last acquired, first released, one at a time; a failing release is
 *   logged and the rest still run.
 * - Every release is joined: an early release, a concurrent `dispose()` and
 *   a rollback all wait for the same cleanup, and `dispose()` resolves only
 *   when every release has settled, including releases started earlier.
 * - After `cancel()` (or `dispose()`), acquisitions are refused: the resource
 *   is undone at once, its cleanup is joined by a dispose still in progress,
 *   and the caller gets a `Disposed` error. This is how late work from an
 *   abandoned asynchronous `apply` is cleaned up.
 */
export class Activation {
  private readonly held: Held[] = [];
  /** Releases started and not yet settled, early and late ones included. */
  private readonly releasing = new Set<Promise<void>>();
  private live = true;
  private disposing?: Promise<void>;
  private resolveCancelled!: () => void;
  /** Resolves once this activation is cancelled or disposed. */
  readonly cancelled = new Promise<void>((resolve) => {
    this.resolveCancelled = resolve;
  });

  constructor(
    private readonly owner: string,
    private readonly ledger: ResourceLedger,
    private readonly logger: Logger,
  ) {}

  get isLive(): boolean {
    return this.live;
  }

  /** Stop accepting resources without releasing the ones already held. */
  cancel(): void {
    this.live = false;
    this.resolveCancelled();
  }

  /**
   * Hold `resource` until this activation is disposed. Returns its early
   * release, which a later dispose joins.
   */
  acquire(kind: string, resource: Disposer | Resource): Disposer {
    const undo = () =>
      typeof resource === "function" ? resource() : resource.dispose();
    if (!this.live) {
      this.releaseRefused(undo);
      throw new CoreError("Disposed", `${this.owner} acquired a ${kind}`);
    }
    return this.hold(kind, undo);
  }

  /** Release everything, last acquired first; every caller gets the same promise. */
  dispose(): Promise<void> {
    this.cancel();
    return (this.disposing ??= this.releaseAll());
  }

  private hold(kind: string, undo: () => unknown): Disposer {
    let releasing: Promise<void> | undefined;
    const entry: Held = {
      release: () => {
        if (!releasing) {
          // Set before `undo` runs: an undo can re-enter this release (a
          // child plugin detaching from its parent) and must join, not rerun.
          let adopt!: (work: Promise<void>) => void;
          releasing = new Promise<void>((resolve) => (adopt = resolve));
          this.held.splice(this.held.indexOf(entry), 1);
          // Out of `held` but still owned: dispose() joins it.
          this.track(releasing);
          adopt(this.run(kind, undo));
        }
        return releasing;
      },
    };
    this.held.push(entry);
    this.ledger.add(this.owner, kind);
    return entry.release;
  }

  private async run(kind: string, undo: () => unknown): Promise<void> {
    try {
      await undo();
    } catch (error) {
      this.ledger.add(this.owner, `failed ${kind}`);
      throw error;
    } finally {
      this.ledger.remove(this.owner, kind);
    }
  }

  /** A refused resource is undone at once; a failure is logged, never unhandled. */
  private releaseRefused(undo: () => unknown): void {
    const failed = (error: unknown) =>
      this.logger.error("Disposal failed", error);
    try {
      this.track(Promise.resolve(undo()).then(() => undefined, failed));
    } catch (error) {
      failed(error);
    }
  }

  private async releaseAll(): Promise<void> {
    for (const item of this.held.slice().reverse()) {
      await item.release().catch((error: unknown) => {
        this.logger.error("Disposal failed", error);
      });
    }
    // Releases started before this dispose (their callers see their errors)
    // and late resources refused during it, in as many waves as arrive.
    while (this.releasing.size) {
      await Promise.allSettled([...this.releasing]);
    }
  }

  private track(release: Promise<void>): void {
    this.releasing.add(release);
    const forget = () => void this.releasing.delete(release);
    release.then(forget, forget);
  }
}
