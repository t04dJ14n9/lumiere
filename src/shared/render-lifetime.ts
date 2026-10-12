/**
 * Ownership of asynchronous render passes in editor widgets. Each mounted
 * widget DOM gets a lifetime; a pass that resolves after the lifetime ended is
 * disposed at once, and an owner (one per plugin) can await every disposal.
 */
export interface Disposable {
  dispose(): unknown;
}

/** One plugin's outstanding render and disposal work, awaited on teardown. */
export class PassOwner {
  private readonly pending = new Set<Promise<unknown>>();
  private readonly lifetimes = new Set<PassLifetime>();
  track<T>(work: Promise<T>): Promise<T> {
    const settled = work.catch(() => undefined);
    this.pending.add(settled);
    void settled.then(() => this.pending.delete(settled));
    return work;
  }
  adopt(lifetime: PassLifetime): void {
    this.lifetimes.add(lifetime);
  }
  forget(lifetime: PassLifetime): void {
    this.lifetimes.delete(lifetime);
  }
  /** End every live widget's lifetime and wait for all render work to settle. */
  async drain(): Promise<void> {
    for (const lifetime of [...this.lifetimes]) {
      endLifetime(lifetime);
    }
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }
}

export interface PassLifetime {
  live: boolean;
  readonly passes: Disposable[];
  /** Cancels the render in flight (an AbortController's abort). */
  readonly cancel?: () => void;
  readonly owner?: PassOwner;
}

export function newLifetime(
  owner?: PassOwner,
  cancel?: () => void,
): PassLifetime {
  const lifetime: PassLifetime = {
    live: true,
    passes: [],
    ...(cancel && { cancel }),
    ...(owner && { owner }),
  };
  owner?.adopt(lifetime);
  return lifetime;
}

const dispose = (lifetime: PassLifetime, pass: Disposable) => {
  const work = Promise.resolve().then(() => pass.dispose());
  void (lifetime.owner ? lifetime.owner.track(work) : work).catch(
    () => undefined,
  );
};

/** Keep a pass while its widget lives; dispose it at once when it arrives late. */
export async function adoptPass(
  lifetime: PassLifetime,
  pending: Promise<Disposable>,
): Promise<boolean> {
  const pass = await (lifetime.owner ? lifetime.owner.track(pending) : pending);
  if (!lifetime.live) {
    dispose(lifetime, pass);
    return false;
  }
  lifetime.passes.push(pass);
  return true;
}

/** End a widget's lifetime: abort its render and dispose each pass exactly once. */
export function endLifetime(lifetime: PassLifetime): void {
  if (!lifetime.live) {
    return;
  }
  lifetime.live = false;
  lifetime.cancel?.();
  lifetime.owner?.forget(lifetime);
  for (const pass of lifetime.passes.splice(0)) {
    dispose(lifetime, pass);
  }
}
