/**
 * Events for the viewer core, shaped as VS Code's: subscribing returns a
 * subscription whose `dispose` stops it, so VS Code code can keep it with
 * its own disposables.
 */

export interface Subscription {
  dispose(): void;
}

export type Event<T> = (listener: (value: T) => void) => Subscription;

/**
 * VS Code's `EventEmitter` without VS Code. As there, a listener that
 * throws is reported and the others still run; a listener added while the
 * event fires hears the next one, and one removed meanwhile hears no more.
 */
export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();
  private disposed = false;

  readonly event: Event<T> = (listener) => {
    if (this.disposed) {
      return { dispose: () => {} };
    }
    // A wrapper per subscription: the same listener may subscribe twice.
    const entry = (value: T): void => listener(value);
    this.listeners.add(entry);
    return {
      dispose: () => {
        this.listeners.delete(entry);
      },
    };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) {
        continue;
      }
      try {
        listener(value);
      } catch (error) {
        console.error(error);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
