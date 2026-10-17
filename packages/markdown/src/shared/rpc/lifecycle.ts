import type { Disposer } from "@workshop/core";
export interface Transport {
  send(message: unknown): void;
  listen(receive: (message: unknown) => void): Disposer;
}
/** Timers are injected so shared code needs neither DOM nor Node ambient APIs. */
export interface Clock {
  after(ms: number, callback: () => void): Disposer;
}
export interface Cancellation {
  readonly cancelled: boolean;
  onCancel(callback: () => void): Disposer;
}
export class CancelToken implements Cancellation {
  cancelled = false;
  private readonly listeners = new Set<() => void>();
  onCancel(callback: () => void): Disposer {
    if (this.cancelled) {
      callback();
    } else {
      this.listeners.add(callback);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }
  cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    for (const callback of this.listeners) {
      callback();
    }
    this.listeners.clear();
  }
}
export class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
