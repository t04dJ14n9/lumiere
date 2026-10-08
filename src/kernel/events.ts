import type { Disposer, EventFunction, Events } from "./types";
import type { Logger } from "./logger";
type Listener = { run: (...args: never[]) => unknown; logger: Logger };
export class EventBus {
  private readonly listeners = new Map<keyof Events, Listener[]>();
  on<K extends keyof Events>(name: K, run: EventFunction<K>, logger: Logger, prepend = false): Disposer {
    const entry = { run: run as Listener["run"], logger };
    const list = this.listeners.get(name) ?? [];
    if (prepend) list.unshift(entry);
    else list.push(entry);
    this.listeners.set(name, list);
    return () => {
      const i = list.indexOf(entry);
      if (i >= 0) list.splice(i, 1);
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
    for (const l of [...(this.listeners.get(name) ?? [])]) void this.awaited(l, args);
  }
  async serial(name: keyof Events, args: unknown[]): Promise<void> {
    for (const l of [...(this.listeners.get(name) ?? [])]) await this.awaited(l, args);
  }
  async parallel(name: keyof Events, args: unknown[]): Promise<void> {
    await Promise.all([...(this.listeners.get(name) ?? [])].map((l) => this.awaited(l, args)));
  }
  bail(name: keyof Events, args: unknown[]): unknown {
    for (const l of [...(this.listeners.get(name) ?? [])]) {
      const value = this.invoke(l, args);
      if (value !== undefined) {
        if (value instanceof Promise) void value.catch((error) => l.logger.error("Event listener failed", error));
        return value;
      }
    }
    return undefined;
  }
  async waterfall(name: keyof Events, value: unknown): Promise<unknown> {
    for (const l of [...(this.listeners.get(name) ?? [])]) {
      const next = await this.awaited(l, [value]);
      if (next !== undefined) value = next;
    }
    return value;
  }
}
