import type { Event, Disposable } from "vscode";
/** Small native-free event source; a faulty consumer cannot stop other listeners. */
export class ApiEvent<T> {
  private readonly listeners = new Set<(value: T) => void>();
  readonly event: Event<T> = (listener, thisArgs, disposables) => {
    const bound = (value: T) => listener.call(thisArgs, value);
    this.listeners.add(bound);
    const disposable: Disposable = {
      dispose: () => {
        this.listeners.delete(bound);
      },
    };
    disposables?.push(disposable);
    return disposable;
  };
  constructor(private readonly failed: (error: unknown) => void) {}
  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(value);
      } catch (error) {
        this.failed(error);
      }
    }
  }
  dispose(): void {
    this.listeners.clear();
  }
}
