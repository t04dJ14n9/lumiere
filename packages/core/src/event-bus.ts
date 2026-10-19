import type { Disposer } from "./activation";
import type { EventFunction, Events } from "./types";
import type { Logger } from "./logger";
type Listener = {
  run: (...args: never[]) => unknown;
  logger: Logger;
  owner: string;
  slot: number;
};
export class EventBus {
  private readonly listeners = new Map<keyof Events, Listener[]>();
  constructor(private readonly rank: (owner: string) => number = () => 0) {}
  on<K extends keyof Events>(
    name: K,
    run: EventFunction<K>,
    options: { logger: Logger; prepend?: boolean; owner?: string },
  ): Disposer {
    const { logger, prepend = false, owner = "root" } = options;
    const entry = {
      run: run as Listener["run"],
      logger,
      owner,
      slot: prepend ? 0 : 1,
    };
    const list = this.listeners.get(name) ?? [];
    list.push(entry);
    // Stable sort retains registration order inside each owner's slot.
    list.sort(
      (a, b) =>
        a.slot - b.slot ||
        this.rank(a.owner) - this.rank(b.owner) ||
        compareOwners(a.owner, b.owner),
    );
    this.listeners.set(name, list);
    return () => {
      const i = list.indexOf(entry);
      if (i >= 0) {
        list.splice(i, 1);
      }
    };
  }
  private invoke(listener: Listener, args: unknown[]): unknown {
    try {
      return listener.run(...(args as never[]));
    } catch (error) {
      listener.logger.error("Event listener failed", error);
      return undefined;
    }
  }
  private async awaited(listener: Listener, args: unknown[]): Promise<unknown> {
    try {
      return await this.invoke(listener, args);
    } catch (error) {
      listener.logger.error("Event listener failed", error);
      return undefined;
    }
  }
  emit(name: keyof Events, args: unknown[]): void {
    for (const l of [...(this.listeners.get(name) ?? [])]) {
      void this.awaited(l, args);
    }
  }
  async serial(name: keyof Events, args: unknown[]): Promise<void> {
    for (const l of [...(this.listeners.get(name) ?? [])]) {
      await this.awaited(l, args);
    }
  }
  async parallel(name: keyof Events, args: unknown[]): Promise<void> {
    await Promise.all(
      [...(this.listeners.get(name) ?? [])].map((l) => this.awaited(l, args)),
    );
  }
  bail(name: keyof Events, args: unknown[]): unknown {
    for (const l of [...(this.listeners.get(name) ?? [])]) {
      const value = this.invoke(l, args);
      if (value !== undefined) {
        if (value instanceof Promise) {
          void value.catch((error) =>
            l.logger.error("Event listener failed", error),
          );
        }
        return value;
      }
    }
    return undefined;
  }
  async pipeline(name: keyof Events, value: unknown): Promise<unknown> {
    for (const l of [...(this.listeners.get(name) ?? [])]) {
      const next = await this.awaited(l, [value]);
      if (next !== undefined) {
        value = next;
      }
    }
    return value;
  }
}

function compareOwners(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
