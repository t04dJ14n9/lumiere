import { KernelError } from "./errors";
import { EventBus } from "./events";
import { Fiber } from "./fiber";
import { silentLogger, taggedLogger } from "./logger";
import type { Logger } from "./logger";
import { asPlugin, bindCaller } from "./services";
import type { CallerBound, ServiceClass } from "./services";
import type { Disposer, EventFunction, Events, Plugin, Services } from "./types";
type Provider = { ctx: Context; value: unknown };
export class Runtime {
  readonly events: EventBus;
  readonly fibers = new Set<Fiber<unknown>>();
  readonly providers = new Map<keyof Services, Provider[]>();
  readonly jobs = new Set<Promise<unknown>>();
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
  changed(): void {
    for (const fiber of this.fibers) fiber.reconcile();
  }
  track(job: Promise<unknown>): void {
    this.jobs.add(job);
    void job.finally(() => this.jobs.delete(job));
  }
  async settled(): Promise<void> {
    while (this.jobs.size) await Promise.all([...this.jobs]);
  }
}
// Declaration merging exposes typed injected services as properties.
// The Proxy below implements each property from the open Services contract.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface Context extends Services {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Context {
  readonly logger: Logger;
  readonly children: Fiber<unknown>[] = [];
  private readonly effects: Disposer[] = [];
  private readonly offered = new Map<keyof Services, unknown>();
  private readonly bound = new Map<unknown, unknown>();
  private live = true;
  private published = false;
  constructor(
    readonly runtime = new Runtime(silentLogger, new Set()),
    readonly fiber?: Fiber<unknown>,
  ) {
    this.logger = taggedLogger(runtime.logger, fiber?.definition.name ?? "root");
    return new Proxy(this, {
      get: (target, key, receiver) => {
        // Promise resolution probes this property on returned contexts.
        if (key === "then") return undefined;
        if (Reflect.has(target, key) || typeof key !== "string")
          return Reflect.get(target, key, receiver);
        target.assertLive();
        const name = key as keyof Services;
        if (
          !fiber?.definition.inject?.required?.includes(name) &&
          !fiber?.definition.inject?.optional?.includes(name)
        )
          throw new KernelError(
            "UndeclaredService",
            `${fiber?.definition.name ?? "root"} did not inject ${key}`,
          );
        const value = runtime.value(name);
        if (value && (typeof value === "object" || typeof value === "function") &&
            bindCaller in value && typeof value[bindCaller] === "function") {
          if (!target.bound.has(value)) {
            target.bound.set(value, (value as CallerBound)[bindCaller](receiver));
          }
          return target.bound.get(value);
        }
        return value;
      },
    });
  }
  static create(
    options: { logger?: Logger; replaceable?: readonly (keyof Services)[]; rank?: (owner: string) => number } = {},
  ): Context {
    return new Context(new Runtime(options.logger ?? silentLogger, new Set(options.replaceable), options.rank));
  }
  assertLive(): void {
    if (!this.live) throw new KernelError("Disposed", "Context is disposed");
  }
  plugin<C>(definition: Plugin<C>, config?: C): Fiber<C>;
  plugin<C>(definition: ServiceClass<C>, config?: C): Fiber<C>;
  plugin<C>(definition: Plugin<C> | ServiceClass<C>, config?: C): Fiber<C> {
    this.assertLive();
    const fiber = new Fiber(this.runtime, asPlugin(definition), config as C);
    this.children.push(fiber as Fiber<unknown>);
    fiber.reconcile();
    return fiber;
  }
  provide<K extends keyof Services>(name: K, value: Services[K]): void {
    this.assertLive();
    if (value === undefined)
      throw new KernelError("DuplicateService", "Services cannot be undefined");
    if (this.offered.has(name)) throw new KernelError("DuplicateService", String(name));
    this.offered.set(name, value);
    if (!this.fiber || this.published) this.publish();
  }
  publish(): void {
    this.assertLive();
    for (const name of this.offered.keys()) {
      const stack = this.runtime.providers.get(name) ?? [];
      if (stack.some((p) => p.ctx !== this) && !this.runtime.replaceable.has(name))
        throw new KernelError("DuplicateService", String(name));
    }
    for (const [name, value] of this.offered) {
      const stack = this.runtime.providers.get(name) ?? [];
      if (!stack.some((p) => p.ctx === this)) stack.push({ ctx: this, value });
      this.runtime.providers.set(name, stack);
    }
    this.published = true;
    this.runtime.changed();
  }
  effect(setup: () => Disposer | { dispose(): unknown }): Disposer {
    this.assertLive();
    const result = setup();
    let active = true;
    const dispose = async () => {
      if (!active) return;
      active = false;
      if (typeof result === "function") await result();
      else await result.dispose();
    };
    this.effects.push(dispose);
    return dispose;
  }
  on<K extends keyof Events>(
    name: K,
    listener: EventFunction<K>,
    options?: { prepend?: boolean },
  ): Disposer {
    return this.effect(() => this.runtime.events.on(name, listener, this.logger, options?.prepend, this.fiber?.definition.name ?? "root"));
  }
  emit<K extends keyof Events>(name: K, ...args: Parameters<EventFunction<K>>): void {
    this.assertLive();
    this.runtime.events.emit(name, args);
  }
  serial<K extends keyof Events>(name: K, ...args: Parameters<EventFunction<K>>): Promise<void> {
    this.assertLive();
    return this.runtime.events.serial(name, args);
  }
  parallel<K extends keyof Events>(name: K, ...args: Parameters<EventFunction<K>>): Promise<void> {
    this.assertLive();
    return this.runtime.events.parallel(name, args);
  }
  bail<K extends keyof Events>(
    name: K,
    ...args: Parameters<EventFunction<K>>
  ): ReturnType<EventFunction<K>> | undefined {
    this.assertLive();
    return this.runtime.events.bail(name, args) as ReturnType<EventFunction<K>> | undefined;
  }
  waterfall<K extends keyof Events>(
    name: K,
    value: Parameters<EventFunction<K>>[0],
  ): Promise<Parameters<EventFunction<K>>[0]> {
    this.assertLive();
    return this.runtime.events.waterfall(name, value) as Promise<Parameters<EventFunction<K>>[0]>;
  }
  settled(): Promise<void> {
    return this.runtime.settled();
  }
  async dispose(): Promise<void> {
    if (!this.live) return;
    this.live = false;
    for (const dispose of this.effects.reverse()) {
      try {
        await dispose();
      } catch (error) {
        this.logger.error("Effect disposal failed", error);
      }
    }
    for (const child of [...this.children].reverse()) await child.dispose();
    for (const name of this.offered.keys()) {
      const stack = this.runtime.providers.get(name);
      if (stack)
        this.runtime.providers.set(
          name,
          stack.filter((p) => p.ctx !== this),
        );
    }
    this.bound.clear();
    this.runtime.changed();
  }
}
